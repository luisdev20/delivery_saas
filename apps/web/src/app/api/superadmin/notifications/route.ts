import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/superadminAccess';
import type { TenantNotificationSeverity, TenantNotificationType } from '@/lib/supabase/types';

interface SendNotificationBody {
  tenantIds?: string[];
  type?: TenantNotificationType;
  severity?: TenantNotificationSeverity;
  title?: string;
  message?: string;
}

const VALID_TYPES: TenantNotificationType[] = [
  'SUBSCRIPTION_EXPIRING',
  'SUBSCRIPTION_EXPIRED',
  'GRACE_GRANTED',
  'ACCOUNT_STATUS',
  'GENERAL',
];

const VALID_SEVERITIES: TenantNotificationSeverity[] = ['INFO', 'WARNING', 'URGENT'];

export async function POST(req: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: SendNotificationBody;
  try {
    body = (await req.json()) as SendNotificationBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const tenantIds = Array.from(new Set((body.tenantIds ?? []).filter(Boolean)));
  const title = body.title?.trim() || '';
  const message = body.message?.trim() || '';
  const type: TenantNotificationType =
    body.type && VALID_TYPES.includes(body.type) ? body.type : 'GENERAL';
  const severity: TenantNotificationSeverity =
    body.severity && VALID_SEVERITIES.includes(body.severity) ? body.severity : 'INFO';

  if (tenantIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un comercio destinatario.' }, { status: 400 });
  }
  if (!title || !message) {
    return NextResponse.json({ error: 'El título y el mensaje son obligatorios.' }, { status: 400 });
  }

  const rows = tenantIds.map((tenantId) => ({
    tenant_id: tenantId,
    type,
    severity,
    title,
    message,
    created_by: access.userId,
  }));

  const { data, error } = await access.admin
    .from('tenant_notifications')
    .insert(rows)
    .select();

  if (error) {
    const isMissingTable =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message.includes('tenant_notifications');
    return NextResponse.json(
      {
        error: isMissingTable
          ? 'La tabla tenant_notifications aún no existe en Supabase. Ejecuta la migración 014_superadmin_governance_and_notifications.sql.'
          : error.message,
      },
      { status: isMissingTable ? 400 : 500 }
    );
  }

  return NextResponse.json({
    success: true,
    sentCount: data?.length ?? rows.length,
    notifications: data ?? [],
  });
}
