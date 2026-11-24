import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionContext } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import SuperAdminClient from './SuperAdminClient';
import type { Restaurant, Subscription, TenantNotification } from '@/lib/supabase/types';
import type { BillingTransaction } from '@/lib/subscription';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Consola de Plataforma — Delivery Tracker SuperAdmin',
  description: 'Gobernanza de comercios, salud de suscripciones, prórrogas, soporte y notificaciones.',
};

export interface TenantMetricsSummary {
  tenantId: string;
  activeDrivers: number;
  totalAccounts: number;
  ownerEmail: string | null;
}

export default async function SuperAdminPage() {
  const session = await getSessionContext();

  if (!session.userId) {
    redirect('/login');
  }

  // Strict RBAC: Solo superadmin puede ver esta página
  if (session.role !== 'superadmin') {
    redirect(session.tenantSlug ? `/admin/${session.tenantSlug}` : '/login');
  }

  const admin = createAdminClient();

  // PRIVACIDAD ESTRICTA: Esta consola NO consulta la tabla `orders` ni datos de clientes finales.
  const [
    { data: tenants },
    { data: subscriptions },
    { data: transactions },
    { data: drivers },
    { data: tenantUsers },
    notificationsRes,
    usersRes,
  ] = await Promise.all([
    admin.from('tenants').select('*').order('created_at', { ascending: false }),
    admin.from('subscriptions').select('*').order('created_at', { ascending: false }),
    admin.from('billing_transactions').select('*').order('created_at', { ascending: false }).limit(200),
    admin.from('drivers').select('id, tenant_id, is_active, deleted_at'),
    admin.from('tenant_users').select('id, tenant_id, role, user_id'),
    admin.from('tenant_notifications').select('*').order('created_at', { ascending: false }).limit(60),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  const emailByUserId = new Map<string, string>();
  if (usersRes?.data?.users) {
    for (const u of usersRes.data.users) {
      if (u.id && u.email) emailByUserId.set(u.id, u.email);
    }
  }

  const metricsMap = new Map<string, TenantMetricsSummary>();
  for (const t of (tenants ?? []) as Restaurant[]) {
    metricsMap.set(t.id, {
      tenantId: t.id,
      activeDrivers: 0,
      totalAccounts: 0,
      ownerEmail: null,
    });
  }

  for (const d of drivers ?? []) {
    const entry = metricsMap.get(d.tenant_id);
    if (entry && d.is_active && !d.deleted_at) {
      entry.activeDrivers += 1;
    }
  }

  for (const tu of tenantUsers ?? []) {
    const entry = metricsMap.get(tu.tenant_id);
    if (!entry) continue;
    if (tu.role !== 'superadmin') {
      entry.totalAccounts += 1;
    }
    if (tu.role === 'owner' && !entry.ownerEmail) {
      entry.ownerEmail = emailByUserId.get(tu.user_id) ?? null;
    }
  }

  const notifications = notificationsRes.error
    ? []
    : ((notificationsRes.data ?? []) as TenantNotification[]);

  return (
    <SuperAdminClient
      tenants={(tenants ?? []) as Restaurant[]}
      subscriptions={(subscriptions ?? []) as Subscription[]}
      transactions={(transactions ?? []) as BillingTransaction[]}
      tenantMetrics={Array.from(metricsMap.values())}
      initialNotifications={notifications}
      notificationsReady={!notificationsRes.error}
      userEmail={session.email}
    />
  );
}
