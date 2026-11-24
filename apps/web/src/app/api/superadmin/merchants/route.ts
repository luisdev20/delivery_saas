import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/superadminAccess';
import { PLAN_CATALOG, PAID_PLANS, todayInPen } from '@/lib/subscription';
import type { PlanType } from '@/lib/supabase/types';

interface CreateMerchantBody {
  name?: string;
  slug?: string;
  ruc?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  maxDeliveryRadiusKm?: number;
  plan?: PlanType;
  ownerEmail?: string;
  ownerPassword?: string;
}

interface PatchMerchantBody {
  action?: 'suspend' | 'reactivate';
  tenantId?: string;
  reason?: string;
}

export async function POST(req: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: CreateMerchantBody;
  try {
    body = (await req.json()) as CreateMerchantBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const name = body.name?.trim() || '';
  const cleanSlug = (body.slug || name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const phone = body.phone?.trim() || '';
  const ruc = body.ruc?.replace(/\D/g, '') || null;
  const address = body.address?.trim() || 'Lima, Perú';
  const plan: PlanType = body.plan && PAID_PLANS.includes(body.plan) ? body.plan : 'STARTER';
  const ownerEmail = body.ownerEmail?.trim().toLowerCase() || '';
  const ownerPassword = body.ownerPassword?.trim() || '';

  if (!name || !cleanSlug) {
    return NextResponse.json({ error: 'Nombre comercial y slug son obligatorios.' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: 'El teléfono de contacto del comercio es obligatorio.' }, { status: 400 });
  }
  if (ruc && ruc.length !== 8 && ruc.length !== 11) {
    return NextResponse.json({ error: 'El DNI/RUC debe tener 8 u 11 dígitos.' }, { status: 400 });
  }
  if (!ownerEmail || !ownerEmail.includes('@')) {
    return NextResponse.json({ error: 'Ingresa un correo válido para el propietario del comercio.' }, { status: 400 });
  }
  if (ownerPassword.length < 6) {
    return NextResponse.json(
      { error: 'La contraseña inicial del propietario debe tener al menos 6 caracteres.' },
      { status: 400 }
    );
  }

  const { admin } = access;

  // 1. Verificar slug disponible
  const { data: existingSlug } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', cleanSlug)
    .maybeSingle();

  if (existingSlug) {
    return NextResponse.json(
      { error: `El identificador "${cleanSlug}" ya está registrado.` },
      { status: 409 }
    );
  }

  // 2. Crear usuario propietario en Supabase Auth
  const { data: createdAuth, error: authError } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });

  if (authError || !createdAuth?.user) {
    return NextResponse.json(
      { error: authError?.message || 'No se pudo crear la cuenta del propietario en Auth.' },
      { status: 400 }
    );
  }

  const ownerUserId = createdAuth.user.id;

  // 3. Crear registro en tenants
  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({
      name,
      slug: cleanSlug,
      phone,
      ruc,
      address,
      lat: typeof body.lat === 'number' ? body.lat : -12.0864,
      lng: typeof body.lng === 'number' ? body.lng : -77.0328,
      max_delivery_radius_km: Number(body.maxDeliveryRadiusKm) || 10,
      brand_color: '#4F46E5',
      is_open: true,
    })
    .select()
    .single();

  if (tenantError || !tenant) {
    await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
    return NextResponse.json(
      { error: tenantError?.message || 'No se pudo registrar el comercio.' },
      { status: 500 }
    );
  }

  // 4. Vincular owner en tenant_users
  const { error: linkError } = await admin.from('tenant_users').insert({
    user_id: ownerUserId,
    tenant_id: tenant.id,
    role: 'owner',
  });

  if (linkError) {
    await admin.from('tenants').delete().eq('id', tenant.id);
    await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
    return NextResponse.json(
      { error: `No se pudo vincular el propietario al comercio: ${linkError.message}` },
      { status: 500 }
    );
  }

  // 5. Crear suscripción inicial usando PLAN_CATALOG como única fuente de verdad
  const catalog = PLAN_CATALOG[plan];
  const { data: subscription, error: subError } = await admin
    .from('subscriptions')
    .insert({
      tenant_id: tenant.id,
      plan,
      max_drivers: catalog.maxDrivers,
      max_orders_per_month: catalog.maxOrders,
      orders_this_month: 0,
      billing_cycle_start: todayInPen(),
      is_active: true,
    })
    .select()
    .single();

  if (subError) {
    return NextResponse.json(
      { error: `Comercio creado pero falló la suscripción inicial: ${subError.message}` },
      { status: 500 }
    );
  }

  // 6. Registrar comprobante presencial en billing_transactions para auditoría SaaS
  const txCode = `PRES-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  const { data: transaction } = await admin
    .from('billing_transactions')
    .insert({
      tenant_id: tenant.id,
      plan_selected: plan,
      amount_pen: catalog.price,
      payment_method: 'YAPE',
      transaction_code: txCode,
      status: 'PAID',
    })
    .select()
    .single();

  return NextResponse.json({
    success: true,
    tenant,
    subscription,
    transaction: transaction ?? null,
    ownerEmail,
  });
}

export async function PATCH(req: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: PatchMerchantBody;
  try {
    body = (await req.json()) as PatchMerchantBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const { action, tenantId } = body;
  const reason = body.reason?.trim() || '';

  if (!tenantId || (action !== 'suspend' && action !== 'reactivate')) {
    return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
  }
  if (action === 'suspend' && !reason) {
    return NextResponse.json({ error: 'Debes indicar el motivo de la suspensión.' }, { status: 400 });
  }

  const { admin, userId } = access;
  const isSuspending = action === 'suspend';

  const { data: updatedTenant, error } = await admin
    .from('tenants')
    .update({
      is_suspended: isSuspending,
      suspended_at: isSuspending ? new Date().toISOString() : null,
      suspended_reason: isSuspending ? reason : null,
    })
    .eq('id', tenantId)
    .select()
    .single();

  if (error) {
    const isMissingColumn =
      error.message.includes('is_suspended') || error.code === '42703' || error.code === 'PGRST204';
    return NextResponse.json(
      {
        error: isMissingColumn
          ? 'Faltan columnas de suspensión en Supabase. Ejecuta la migración 014_superadmin_governance_and_notifications.sql.'
          : error.message,
      },
      { status: isMissingColumn ? 400 : 500 }
    );
  }

  // Enviar aviso interno en tiempo real al comercio (si la tabla existe)
  await admin
    .from('tenant_notifications')
    .insert({
      tenant_id: tenantId,
      type: 'ACCOUNT_STATUS',
      severity: isSuspending ? 'URGENT' : 'INFO',
      title: isSuspending ? 'Cuenta suspendida por administración' : 'Cuenta reactivada',
      message: isSuspending
        ? `Tu cuenta fue puesta en modo solo lectura. Motivo: ${reason}`
        : 'Tu cuenta comercial ha sido reactivada por el equipo de administración.',
      created_by: userId,
    })
    .then(() => {}, () => {});

  return NextResponse.json({ success: true, tenant: updatedTenant });
}
