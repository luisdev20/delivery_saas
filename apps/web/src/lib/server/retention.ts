import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subscription } from '@/lib/supabase/types';
import type { BillingTransaction } from '@/lib/subscription';
import { getRetentionInfo, type RetentionInfo } from '@/lib/retention';
import { fetchAllRows } from '@/lib/server/query';

interface TenantRetentionSource {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  retention_hold?: boolean | null;
  retention_extended_until?: string | null;
}

export interface TenantRetentionRow {
  tenantId: string;
  name: string;
  slug: string;
  createdAt: string;
  plan: Subscription['plan'] | null;
  hold: boolean;
  extendedUntil: string | null;
  info: RetentionInfo;
}

export interface RetentionCycleResult {
  scanned: number;
  notices: number;
  purged: number;
  skipped: number;
  tenants: Array<{
    tenantId: string;
    name: string;
    stage: string;
    action: 'notice' | 'purged' | 'skipped' | 'none';
    reason?: string;
  }>;
}

interface RetentionEvent {
  tenant_id: string;
  event_type: string;
  created_at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Carga el cronograma de retención de todos los comercios.
 *
 * Se apoya en `select('*')` para tolerar entornos donde la migración
 * 013 todavía no se aplicó: las columnas opcionales simplemente no
 * llegan y la política se calcula igual.
 */
export async function loadTenantRetentionList(
  admin: SupabaseClient
): Promise<TenantRetentionRow[]> {
  const [tenants, subscriptions, transactions] = await Promise.all([
    fetchAllRows<TenantRetentionSource>(admin, 'tenants', '*', {
      order: { column: 'created_at', ascending: true },
    }),
    fetchAllRows<Subscription>(admin, 'subscriptions', '*', {
      order: { column: 'created_at', ascending: false },
    }),
    fetchAllRows<Pick<BillingTransaction, 'tenant_id' | 'payment_method' | 'created_at'>>(
      admin,
      'billing_transactions',
      'tenant_id, payment_method, created_at',
      { order: { column: 'created_at', ascending: false } }
    ),
  ]);

  const latestSubscription = new Map<string, Subscription>();
  for (const subscription of subscriptions) {
    if (!latestSubscription.has(subscription.tenant_id)) {
      latestSubscription.set(subscription.tenant_id, subscription);
    }
  }

  const latestTransaction = new Map<string, Pick<BillingTransaction, 'payment_method'>>();
  for (const transaction of transactions) {
    if (!latestTransaction.has(transaction.tenant_id)) {
      latestTransaction.set(transaction.tenant_id, transaction);
    }
  }

  return tenants.map((tenant) => {
    const subscription = latestSubscription.get(tenant.id) ?? null;
    const lastTransaction = latestTransaction.get(tenant.id) ?? null;

    const info = getRetentionInfo({
      createdAt: tenant.created_at,
      subscription,
      lastTransaction: lastTransaction ?? null,
      extendedUntil: tenant.retention_extended_until ?? null,
      hold: tenant.retention_hold ?? false,
    });

    return {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.created_at,
      plan: subscription?.plan ?? null,
      hold: tenant.retention_hold ?? false,
      extendedUntil: tenant.retention_extended_until ?? null,
      info,
    };
  });
}

async function recordEvent(
  admin: SupabaseClient,
  row: TenantRetentionRow,
  eventType: string,
  channel: 'IN_APP' | 'EMAIL',
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await admin.from('tenant_retention_events').insert({
    tenant_id: row.tenantId,
    tenant_name: row.name,
    tenant_slug: row.slug,
    event_type: eventType,
    channel,
    metadata,
  });

  if (error) {
    console.error('No se pudo registrar el evento de retención:', error.message);
  }
}

/** Correo del propietario del comercio, cuando Resend está configurado. */
async function ownerEmail(
  admin: SupabaseClient,
  tenantId: string
): Promise<string | null> {
  const { data: members } = await admin
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'manager'])
    .limit(1);

  const userId = members?.[0]?.user_id;
  if (!userId) return null;

  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function sendNoticeEmail(
  admin: SupabaseClient,
  row: TenantRetentionRow
): Promise<boolean> {
  const to = await ownerEmail(admin, row.tenantId);
  if (!to) return false;

  const purgeDate = new Date(row.info.purgeAt).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

  const subject = `Eliminación programada de la cuenta ${row.name}`;
  const html = [
    '<div style="font-family:Inter,Arial,sans-serif;color:#1E293B;line-height:1.6">',
    `<h2 style="color:#312E81">Aviso de eliminación de datos — ${row.name}</h2>`,
    `<p>${row.info.detail}</p>`,
    `<p><strong>Fecha de eliminación definitiva:</strong> ${purgeDate}</p>`,
    '<p>Para conservar la información del comercio, reactiva una suscripción desde el panel de administración.</p>',
    '<p style="color:#64748B;font-size:12px">DeliveryOS · Plataforma de despacho de última milla</p>',
    '</div>',
  ].join('');

  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RETENTION_EMAIL_FROM;

  if (resendKey && resendFrom) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: resendFrom, to, subject, html }),
    });
    return response.ok;
  }

  return sendWithBrevo(admin, { to, subject, html });
}

/**
 * Alternativa sin variables de entorno: reutiliza la cuenta de correo
 * transaccional que el proyecto ya mantiene en `private_app_config`.
 */
async function sendWithBrevo(
  admin: SupabaseClient,
  message: { to: string; subject: string; html: string }
): Promise<boolean> {
  const { data, error } = await admin
    .from('private_app_config')
    .select('key, value')
    .in('key', ['BREVO_API_KEY', 'SENDER_EMAIL']);

  if (error || !data) return false;

  const config = new Map(data.map((item) => [item.key as string, item.value as string]));
  const apiKey = config.get('BREVO_API_KEY');
  const sender = process.env.RETENTION_EMAIL_FROM || config.get('SENDER_EMAIL');

  if (!apiKey || !sender) return false;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: sender, name: process.env.NEXT_PUBLIC_APP_NAME || 'DeliveryOS' },
      to: [{ email: message.to }],
      subject: message.subject,
      htmlContent: message.html,
    }),
  });

  return response.ok;
}

/**
 * Elimina de forma definitiva un comercio y sus dependencias.
 *
 * Orden: auditoría, borrado del comercio (cascada sobre pedidos,
 * motorizados, claves de API y membresías) y baja de las cuentas de
 * acceso que quedan sin comercio. Las cuentas con rol superadmin y
 * los comercios resguardados quedan fuera de la purga.
 */
export async function purgeTenant(
  admin: SupabaseClient,
  row: TenantRetentionRow
): Promise<{ deleted: boolean; reason?: string; authUsersDeleted: number }> {
  if (row.hold) {
    return { deleted: false, reason: 'Cuenta resguardada', authUsersDeleted: 0 };
  }

  const { data: members } = await admin
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', row.tenantId);

  if (!members || members.length === 0) {
    return { deleted: false, reason: 'Sin miembros asociados', authUsersDeleted: 0 };
  }

  if (members.some((member) => member.role === 'superadmin')) {
    return {
      deleted: false,
      reason: 'El comercio aloja una cuenta de superadministración',
      authUsersDeleted: 0,
    };
  }

  const { count: orderCount } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', row.tenantId);

  await recordEvent(admin, row, 'PURGED', 'IN_APP', {
    orders: orderCount ?? 0,
    periodEnd: row.info.periodEnd,
    purgeAt: row.info.purgeAt,
  });

  const { error: deleteError } = await admin
    .from('tenants')
    .delete()
    .eq('id', row.tenantId);

  if (deleteError) {
    return { deleted: false, reason: deleteError.message, authUsersDeleted: 0 };
  }

  let authUsersDeleted = 0;

  for (const member of members) {
    const { data: remaining } = await admin
      .from('tenant_users')
      .select('id')
      .eq('user_id', member.user_id)
      .limit(1);

    if (remaining && remaining.length > 0) continue;

    const { error } = await admin.auth.admin.deleteUser(member.user_id);
    if (!error) authUsersDeleted += 1;
  }

  return { deleted: true, authUsersDeleted };
}

/**
 * Ciclo diario: emite avisos previos y ejecuta las purgas vencidas.
 * Idempotente dentro del mismo día gracias al registro de eventos.
 */
export async function runRetentionCycle(
  admin: SupabaseClient,
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<RetentionCycleResult> {
  const now = options.now ?? new Date();
  const rows = await loadTenantRetentionList(admin);

  const noticeable = rows.filter(
    (row) =>
      row.info.stage === 'NOTICE' || row.info.stage === 'FINAL_NOTICE'
  );

  let recentEvents: RetentionEvent[] = [];
  if (noticeable.length > 0) {
    const since = new Date(now.getTime() - 2 * DAY_MS).toISOString();
    const { data } = await admin
      .from('tenant_retention_events')
      .select('tenant_id, event_type, created_at')
      .in('event_type', ['NOTICE', 'FINAL_NOTICE'])
      .gte('created_at', since);
    recentEvents = (data ?? []) as RetentionEvent[];
  }

  const result: RetentionCycleResult = {
    scanned: rows.length,
    notices: 0,
    purged: 0,
    skipped: 0,
    tenants: [],
  };

  for (const row of rows) {
    if (row.info.stage === 'NOTICE' || row.info.stage === 'FINAL_NOTICE') {
      const alreadyNotified = recentEvents.some(
        (event) =>
          event.tenant_id === row.tenantId &&
          event.event_type === row.info.stage
      );

      if (alreadyNotified) {
        result.tenants.push({
          tenantId: row.tenantId,
          name: row.name,
          stage: row.info.stage,
          action: 'none',
        });
        continue;
      }

      if (!options.dryRun) {
        const emailed = await sendNoticeEmail(admin, row);
        await recordEvent(admin, row, row.info.stage, emailed ? 'EMAIL' : 'IN_APP');
        result.notices += 1;
      }

      result.tenants.push({
        tenantId: row.tenantId,
        name: row.name,
        stage: row.info.stage,
        action: 'notice',
      });
      continue;
    }

    if (row.info.stage === 'DUE') {
      if (options.dryRun) {
        result.tenants.push({
          tenantId: row.tenantId,
          name: row.name,
          stage: row.info.stage,
          action: 'skipped',
          reason: 'Simulación',
        });
        continue;
      }

      const outcome = await purgeTenant(admin, row);

      if (outcome.deleted) {
        result.purged += 1;
        result.tenants.push({
          tenantId: row.tenantId,
          name: row.name,
          stage: row.info.stage,
          action: 'purged',
        });
      } else {
        result.skipped += 1;
        result.tenants.push({
          tenantId: row.tenantId,
          name: row.name,
          stage: row.info.stage,
          action: 'skipped',
          reason: outcome.reason,
        });
      }
      continue;
    }

    result.tenants.push({
      tenantId: row.tenantId,
      name: row.name,
      stage: row.info.stage,
      action: 'none',
    });
  }

  return result;
}
