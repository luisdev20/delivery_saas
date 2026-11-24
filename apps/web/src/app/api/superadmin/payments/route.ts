import { NextResponse } from 'next/server';
import type { PlanType, Subscription } from '@/lib/supabase/types';
import { getSessionContext } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAID_PLANS, PLAN_CATALOG, todayInPen } from '@/lib/subscription';

interface PaymentBody {
  tenantId?: string;
  plan?: PlanType;
  paymentMethod?: 'YAPE' | 'TARJETA';
  yapePhone?: string;
  cardLastFour?: string;
  reference?: string;
}

function normalizeDigits(value: string | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function generateTransactionCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TX-${random}-${Date.now().toString().slice(-4)}`;
}

/**
 * Registro de cobro manual desde la consola de superadministración.
 *
 * Cubre los casos que no pasan por la pasarela del comercio
 * (transferencias, Yape coordinado, regularización de mora). Renueva
 * el ciclo y deja el comprobante en la auditoría financiera.
 */
export async function POST(req: Request) {
  const session = await getSessionContext();

  if (session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Requiere rol de superadministrador.' }, { status: 403 });
  }

  let body: PaymentBody;
  try {
    body = (await req.json()) as PaymentBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  if (!body.tenantId) {
    return NextResponse.json({ error: 'Indica el comercio a cobrar.' }, { status: 400 });
  }

  const plan = body.plan as PlanType | undefined;
  if (!plan || !PAID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });
  }

  if (body.paymentMethod !== 'YAPE' && body.paymentMethod !== 'TARJETA') {
    return NextResponse.json(
      { error: 'El método de pago debe ser Yape o Tarjeta.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', body.tenantId)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: 'El comercio indicado no existe.' }, { status: 404 });
  }

  let yapePhone: string | null = null;
  let cardLastFour: string | null = null;

  if (body.paymentMethod === 'YAPE') {
    yapePhone = normalizeDigits(body.yapePhone);
    if (yapePhone.length !== 9) {
      return NextResponse.json(
        { error: 'El celular de Yape debe tener 9 dígitos.' },
        { status: 400 }
      );
    }
  } else {
    cardLastFour = normalizeDigits(body.cardLastFour);
    if (cardLastFour.length !== 4) {
      return NextResponse.json(
        { error: 'Ingresa los últimos 4 dígitos de la tarjeta.' },
        { status: 400 }
      );
    }
  }

  const catalog = PLAN_CATALOG[plan];

  const { data: current } = await admin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', body.tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    tenant_id: body.tenantId,
    plan,
    max_drivers: catalog.maxDrivers,
    max_orders_per_month: catalog.maxOrders,
    orders_this_month: 0,
    billing_cycle_start: todayInPen(),
    is_active: true,
  };

  let subscription: Subscription;
  const previous = (current as Subscription | null) ?? null;
  let createdNew = false;

  if (current) {
    const { data, error } = await admin
      .from('subscriptions')
      .update(payload)
      .eq('id', current.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `No se pudo renovar la suscripción: ${error?.message ?? 'error desconocido'}` },
        { status: 500 }
      );
    }

    subscription = data as Subscription;
  } else {
    const { data, error } = await admin
      .from('subscriptions')
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `No se pudo crear la suscripción: ${error?.message ?? 'error desconocido'}` },
        { status: 500 }
      );
    }

    subscription = data as Subscription;
    createdNew = true;
  }

  const { data: transaction, error: transactionError } = await admin
    .from('billing_transactions')
    .insert({
      tenant_id: body.tenantId,
      plan_selected: plan,
      amount_pen: catalog.price,
      payment_method: body.paymentMethod,
      card_last_four: cardLastFour,
      yape_phone_number: yapePhone,
      transaction_code: generateTransactionCode(),
      status: 'PAID',
    })
    .select()
    .single();

  if (transactionError || !transaction) {
    // Compensación: el ciclo y el comprobante deben avanzar juntos.
    if (createdNew) {
      await admin.from('subscriptions').delete().eq('id', subscription.id);
    } else if (previous) {
      await admin
        .from('subscriptions')
        .update({
          plan: previous.plan,
          max_drivers: previous.max_drivers,
          max_orders_per_month: previous.max_orders_per_month,
          orders_this_month: previous.orders_this_month,
          billing_cycle_start: previous.billing_cycle_start,
          is_active: previous.is_active,
        })
        .eq('id', previous.id);
    }

    return NextResponse.json(
      {
        error: `El cobro no pudo registrarse en la auditoría: ${
          transactionError?.message ?? 'error desconocido'
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    subscription,
    transaction,
    reference: body.reference ?? null,
  });
}
