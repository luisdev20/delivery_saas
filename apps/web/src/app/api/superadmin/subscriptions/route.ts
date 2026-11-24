import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/superadminAccess';
import { formatDatePen } from '@/lib/subscription';

interface SubscriptionGovBody {
  action?: 'grant_grace' | 'cancel_subscription';
  tenantId?: string;
  graceDays?: number;
  reason?: string;
}

export async function POST(req: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: SubscriptionGovBody;
  try {
    body = (await req.json()) as SubscriptionGovBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const { action, tenantId } = body;
  const reason = body.reason?.trim() || '';

  if (!tenantId || (action !== 'grant_grace' && action !== 'cancel_subscription')) {
    return NextResponse.json({ error: 'Acción o comercio inválido.' }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ error: 'Debes registrar un motivo para esta acción.' }, { status: 400 });
  }

  const { admin, userId } = access;

  const { data: currentSub } = await admin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!currentSub) {
    return NextResponse.json({ error: 'Este comercio no tiene suscripción registrada.' }, { status: 404 });
  }

  if (action === 'grant_grace') {
    const days = Math.min(30, Math.max(1, Number(body.graceDays) || 7));
    const graceUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error } = await admin
      .from('subscriptions')
      .update({
        is_active: true,
        grace_until: graceUntil,
        grace_reason: reason,
      })
      .eq('id', currentSub.id)
      .select()
      .single();

    if (error) {
      const isMissingColumn =
        error.message.includes('grace_until') || error.code === '42703' || error.code === 'PGRST204';
      return NextResponse.json(
        {
          error: isMissingColumn
            ? 'Faltan columnas de prórroga en Supabase. Ejecuta la migración 014_superadmin_governance_and_notifications.sql.'
            : error.message,
        },
        { status: isMissingColumn ? 400 : 500 }
      );
    }

    await admin
      .from('tenant_notifications')
      .insert({
        tenant_id: tenantId,
        type: 'GRACE_GRANTED',
        severity: 'WARNING',
        title: `Prórroga de ${days} día${days === 1 ? '' : 's'} otorgada`,
        message: `Se extendió tu acceso operativo hasta el ${formatDatePen(graceUntil)}. Motivo: ${reason}. Recuerda renovar tu suscripción antes de esa fecha.`,
        created_by: userId,
      })
      .then(() => {}, () => {});

    return NextResponse.json({ success: true, subscription: updated });
  }

  // cancel_subscription (soporte)
  const { data: updated, error } = await admin
    .from('subscriptions')
    .update({
      is_active: false,
      grace_until: null,
      grace_reason: null,
    })
    .eq('id', currentSub.id)
    .select()
    .single();

  if (error) {
    // Reintentar solo con is_active si la migración 013 aún no corre
    const fallback = await admin
      .from('subscriptions')
      .update({ is_active: false })
      .eq('id', currentSub.id)
      .select()
      .single();

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscription: fallback.data });
  }

  await admin
    .from('tenant_notifications')
    .insert({
      tenant_id: tenantId,
      type: 'SUBSCRIPTION_EXPIRED',
      severity: 'URGENT',
      title: 'Suscripción desactivada por soporte',
      message: `Tu suscripción fue desactivada a solicitud administrativa (${reason}). Tu panel quedó en modo solo lectura hasta renovar.`,
      created_by: userId,
    })
    .then(() => {}, () => {});

  return NextResponse.json({ success: true, subscription: updated });
}
