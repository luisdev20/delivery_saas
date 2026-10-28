import { NextResponse } from 'next/server';
import type { PlanType, Subscription } from '@/lib/supabase/types';
import { assertCanWrite, requireTenantAccess } from '@/lib/auth/tenantAccess';
import { PLAN_CATALOG, PAID_PLANS, getSubscriptionSnapshot, todayInPen } from '@/lib/subscription';

interface SubscriptionBody {
  action?: 'renew' | 'change_plan' | 'resolve_quota';
  tenantId?: string;
  plan?: PlanType;
  paymentMethod?: 'YAPE' | 'TARJETA';
  yapePhone?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  keepDriverIds?: string[];
}

function normalizeDigits(value: string | undefined): string {
  return (value || '').replace(/\D/g, '');
}

function validateCard(expiry: string | undefined): string | null {
  const match = (expiry || '').trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!match) return 'Ingresa el vencimiento de la tarjeta en formato MM/AA.';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'El mes de vencimiento no es válido.';
  const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  if (endOfMonth.getTime() < Date.now()) return 'La tarjeta está vencida.';
  return null;
}

function generateTransactionCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TX-${random}-${Date.now().toString().slice(-4)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  const access = await requireTenantAccess(tenantId);

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [{ data: subscription }, { data: transactions }] = await Promise.all([
    access.admin
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', access.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    access.admin
      .from('billing_transactions')
      .select('*')
      .eq('tenant_id', access.tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    success: true,
    subscription: subscription ?? null,
    transactions: transactions ?? [],
  });
}

export async function POST(req: Request) {
  let body: SubscriptionBody;
  try {
    body = (await req.json()) as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const access = await requireTenantAccess(body.tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const roleError = assertCanWrite(access.role);
  if (roleError) {
    return NextResponse.json({ error: roleError.error }, { status: roleError.status });
  }

  const { admin, tenantId } = access;

  // ---------------------------------------------------------------
  // Resolución de cupo de motorizados tras un downgrade
  // ---------------------------------------------------------------
  if (body.action === 'resolve_quota') {
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return NextResponse.json({ error: 'No hay una suscripción activa.' }, { status: 404 });
    }

    const { data: activeDrivers } = await admin
      .from('drivers')
      .select('id, name, is_active, deleted_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    const active = activeDrivers ?? [];
    const maxDrivers = Number(subscription.max_drivers) || 0;
    const activeIds = new Set(active.map((d) => d.id));
    const keep = Array.from(new Set(body.keepDriverIds ?? [])).filter((id) => activeIds.has(id));

    if (keep.length > maxDrivers) {
      return NextResponse.json(
        {
          error: `Tu plan solo permite ${maxDrivers} motorizados activos. Selecciona como máximo ${maxDrivers}.`,
        },
        { status: 400 }
      );
    }

    if (active.length <= maxDrivers) {
      return NextResponse.json({ success: true, deactivated: 0, keep });
    }

    const toDeactivate = active.filter((driver) => !keep.includes(driver.id));
    if (toDeactivate.length > 0) {
      const { error } = await admin
        .from('drivers')
        .update({ is_active: false })
        .in(
          'id',
          toDeactivate.map((driver) => driver.id)
        );

      if (error) {
        return NextResponse.json(
          { error: 'No se pudo actualizar el acceso de los motorizados.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      deactivated: toDeactivate.length,
      keep,
    });
  }

  // ---------------------------------------------------------------
  // Renovación / cambio de plan
  // ---------------------------------------------------------------
  const { data: current } = await admin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = (body.plan ?? current?.plan ?? 'STARTER') as PlanType;
  if (!PAID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Plan no válido.' }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod;
  if (paymentMethod !== 'YAPE' && paymentMethod !== 'TARJETA') {
    return NextResponse.json(
      { error: 'Selecciona un método de pago válido (Yape o Tarjeta).' },
      { status: 400 }
    );
  }

  let yapePhone: string | null = null;
  let cardLastFour: string | null = null;

  if (paymentMethod === 'YAPE') {
    yapePhone = normalizeDigits(body.yapePhone);
    if (yapePhone.length !== 9) {
      return NextResponse.json(
        { error: 'El celular de Yape debe tener 9 dígitos.' },
        { status: 400 }
      );
    }
  } else {
    const cardNumber = normalizeDigits(body.cardNumber);
    if (cardNumber.length !== 16) {
      return NextResponse.json(
        { error: 'El número de tarjeta debe tener 16 dígitos.' },
        { status: 400 }
      );
    }
    if (normalizeDigits(body.cardCvv).length !== 3) {
      return NextResponse.json({ error: 'El CVV debe tener 3 dígitos.' }, { status: 400 });
    }
    const cardError = validateCard(body.cardExpiry);
    if (cardError) {
      return NextResponse.json({ error: cardError }, { status: 400 });
    }
    cardLastFour = cardNumber.slice(-4);
  }

  const catalog = PLAN_CATALOG[plan];
  const amount = catalog.price;
  const transactionCode = generateTransactionCode();
  const today = todayInPen();

  const subscriptionPayload = {
    tenant_id: tenantId,
    plan,
    max_drivers: catalog.maxDrivers,
    max_orders_per_month: catalog.maxOrders,
    orders_this_month: 0,
    billing_cycle_start: today,
    is_active: true,
  };

  let updatedSubscription: Subscription;
  const previous: Subscription | null = (current as Subscription | null) ?? null;
  let createdNew = false;

  if (previous) {
    const { data, error } = await admin
      .from('subscriptions')
      .update(subscriptionPayload)
      .eq('id', previous.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `No se pudo actualizar la suscripción: ${error?.message || 'error desconocido'}` },
        { status: 500 }
      );
    }
    updatedSubscription = data as Subscription;
  } else {
    const { data, error } = await admin
      .from('subscriptions')
      .insert(subscriptionPayload)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `No se pudo crear la suscripción: ${error?.message || 'error desconocido'}` },
        { status: 500 }
      );
    }
    updatedSubscription = data as Subscription;
    createdNew = true;
  }

  const { data: transaction, error: transactionError } = await admin
    .from('billing_transactions')
    .insert({
      tenant_id: tenantId,
      plan_selected: plan,
      amount_pen: amount,
      payment_method: paymentMethod,
      card_last_four: cardLastFour,
      yape_phone_number: yapePhone,
      transaction_code: transactionCode,
      status: 'PAID',
    })
    .select()
    .single();

  if (transactionError || !transaction) {
    // Compensación: la suscripción y la auditoría financiera deben avanzar juntas.
    if (createdNew) {
      await admin.from('subscriptions').delete().eq('id', updatedSubscription.id);
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
        error: `No se pudo registrar el comprobante de pago: ${
          transactionError?.message || 'error desconocido'
        }`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    subscription: updatedSubscription,
    transaction,
    snapshot: getSubscriptionSnapshot(
      updatedSubscription,
      transaction,
      new Date()
    ),
  });
}
