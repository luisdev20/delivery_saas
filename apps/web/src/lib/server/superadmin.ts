import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanType, Subscription, Tenant } from '@/lib/supabase/types';
import {
  PLAN_CATALOG,
  getSubscriptionSnapshot,
  type BillingTransaction,
  type SubscriptionStatus,
} from '@/lib/subscription';
import {
  RETENTION_POLICY,
  type RetentionStage,
} from '@/lib/retention';
import { loadTenantRetentionList } from '@/lib/server/retention';
import { fetchAllRows } from '@/lib/server/query';

interface OrderLite {
  tenant_id: string;
  status: string;
  total_amount: number | null;
  created_at: string;
}

export interface SuperAdminTenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  isOpen: boolean;
  plan: PlanType | null;
  planLabel: string;
  price: number;
  status: SubscriptionStatus;
  statusLabel: string;
  periodEnd: string | null;
  daysRemaining: number;
  ordersThisMonth: number;
  maxOrders: number;
  usagePercent: number;
  ordersTotal: number;
  retentionStage: RetentionStage;
  retentionLabel: string;
  purgeAt: string;
  daysUntilPurge: number;
  hold: boolean;
  extendedUntil: string | null;
}

export interface SuperAdminTransaction extends BillingTransaction {
  tenantName: string;
  tenantSlug: string;
}

export interface SuperAdminData {
  generatedAt: string;
  kpis: {
    totalTenants: number;
    openTenants: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    expiredSubscriptions: number;
    mrr: number;
    collectedTotal: number;
    collectedThisMonth: number;
    ordersTotal: number;
    ordersThisMonth: number;
    deliveredTotal: number;
    volumeDelivered: number;
    retentionAlerts: number;
  };
  planBreakdown: Array<{
    plan: PlanType;
    label: string;
    price: number;
    tenants: number;
    mrr: number;
  }>;
  revenueSeries: Array<{ key: string; label: string; amount: number }>;
  tenants: SuperAdminTenant[];
  transactions: SuperAdminTransaction[];
  retention: {
    policy: typeof RETENTION_POLICY;
    grace: number;
    notice: number;
    final: number;
    due: number;
  };
  recentDeletions: Array<{
    tenantName: string;
    tenantSlug: string;
    createdAt: string;
    orders: number | null;
  }>;
}

const MONTHS_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function monthKeyInPen(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(value));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const index = Number(month) - 1;
  return `${MONTHS_ES[index] ?? month} ${year.slice(2)}`;
}

function lastMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    keys.push(`${year}-${month}`);
  }

  return keys;
}

/**
 * Consolida la operación completa de la plataforma: cartera de
 * comercios, suscripciones, cobranza y estado de retención.
 *
 * Se ejecuta con `service_role` porque la auditoría de pagos y el
 * detalle de membresías no se exponen con RLS al cliente.
 */
export async function loadSuperAdminData(
  admin: SupabaseClient
): Promise<SuperAdminData> {
  const [tenants, subscriptions, transactions, orders, retentionRows] =
    await Promise.all([
      fetchAllRows<Tenant>(admin, 'tenants', '*', {
        order: { column: 'created_at', ascending: true },
      }),
      fetchAllRows<Subscription>(admin, 'subscriptions', '*', {
        order: { column: 'created_at', ascending: false },
      }),
      fetchAllRows<BillingTransaction>(admin, 'billing_transactions', '*', {
        order: { column: 'created_at', ascending: false },
        maxRows: 5000,
      }),
      fetchAllRows<OrderLite>(
        admin,
        'orders',
        'tenant_id, status, total_amount, created_at',
        { order: { column: 'created_at', ascending: false }, maxRows: 20000 }
      ),
      loadTenantRetentionList(admin),
    ]);

  const latestSubscription = new Map<string, Subscription>();
  for (const subscription of subscriptions) {
    if (!latestSubscription.has(subscription.tenant_id)) {
      latestSubscription.set(subscription.tenant_id, subscription);
    }
  }

  const latestTransaction = new Map<string, BillingTransaction>();
  for (const transaction of transactions) {
    if (!latestTransaction.has(transaction.tenant_id)) {
      latestTransaction.set(transaction.tenant_id, transaction);
    }
  }

  const retentionByTenant = new Map(
    retentionRows.map((row) => [row.tenantId, row])
  );

  const ordersByTenant = new Map<string, number>();
  const currentMonthKey = monthKeyInPen(new Date().toISOString());

  let ordersThisMonth = 0;
  let deliveredTotal = 0;
  let volumeDelivered = 0;

  for (const order of orders) {
    ordersByTenant.set(
      order.tenant_id,
      (ordersByTenant.get(order.tenant_id) ?? 0) + 1
    );

    if (monthKeyInPen(order.created_at) === currentMonthKey) {
      ordersThisMonth += 1;
    }

    if (order.status === 'ENTREGADO') {
      deliveredTotal += 1;
      volumeDelivered += Number(order.total_amount ?? 0);
    }
  }

  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  const enriched: SuperAdminTenant[] = tenants.map((tenant) => {
    const subscription = latestSubscription.get(tenant.id) ?? null;
    const lastTransaction = latestTransaction.get(tenant.id) ?? null;
    const snapshot = getSubscriptionSnapshot(subscription, lastTransaction);
    const retention = retentionByTenant.get(tenant.id);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.created_at,
      isOpen: tenant.is_open !== false,
      plan: subscription?.plan ?? null,
      planLabel: snapshot.planLabel,
      price: snapshot.price,
      status: snapshot.status,
      statusLabel: snapshot.statusLabel,
      periodEnd: snapshot.periodEnd,
      daysRemaining: snapshot.daysRemaining,
      ordersThisMonth: snapshot.ordersThisMonth,
      maxOrders: snapshot.maxOrders,
      usagePercent: snapshot.usagePercent,
      ordersTotal: ordersByTenant.get(tenant.id) ?? 0,
      retentionStage: retention?.info.stage ?? 'ACTIVE',
      retentionLabel: retention?.info.stageLabel ?? 'Activo',
      purgeAt: retention?.info.purgeAt ?? '',
      daysUntilPurge: retention?.info.daysUntilPurge ?? 0,
      hold: retention?.hold ?? false,
      extendedUntil: retention?.extendedUntil ?? null,
    };
  });

  const collectedThisMonth = transactions
    .filter(
      (transaction) =>
        transaction.status === 'PAID' &&
        monthKeyInPen(transaction.created_at) === currentMonthKey
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount_pen ?? 0), 0);

  const collectedTotal = transactions
    .filter((transaction) => transaction.status === 'PAID')
    .reduce((sum, transaction) => sum + Number(transaction.amount_pen ?? 0), 0);

  const planCounters: Record<PlanType, number> = {
    STARTER: 0,
    GROWTH: 0,
    ENTERPRISE: 0,
  };

  let activeSubscriptions = 0;
  let trialSubscriptions = 0;
  let expiredSubscriptions = 0;
  let mrr = 0;

  for (const tenant of enriched) {
    if (tenant.plan) planCounters[tenant.plan] += 1;

    if (tenant.status === 'ACTIVE') {
      activeSubscriptions += 1;
      mrr += tenant.price;
    } else if (tenant.status === 'TRIAL') {
      trialSubscriptions += 1;
      activeSubscriptions += 1;
    } else {
      expiredSubscriptions += 1;
    }
  }

  const planBreakdown = (Object.keys(PLAN_CATALOG) as PlanType[]).map((plan) => ({
    plan,
    label: PLAN_CATALOG[plan].label,
    price: PLAN_CATALOG[plan].price,
    tenants: planCounters[plan],
    mrr: planCounters[plan] * PLAN_CATALOG[plan].price,
  }));

  const seriesKeys = lastMonthKeys(6);
  const seriesMap = new Map(seriesKeys.map((key) => [key, 0]));

  for (const transaction of transactions) {
    if (transaction.status !== 'PAID') continue;
    const key = monthKeyInPen(transaction.created_at);
    if (seriesMap.has(key)) {
      seriesMap.set(key, (seriesMap.get(key) ?? 0) + Number(transaction.amount_pen ?? 0));
    }
  }

  const revenueSeries = seriesKeys.map((key) => ({
    key,
    label: monthLabel(key),
    amount: seriesMap.get(key) ?? 0,
  }));

  const retentionCounters = { grace: 0, notice: 0, final: 0, due: 0 };
  for (const row of retentionRows) {
    if (row.info.stage === 'GRACE') retentionCounters.grace += 1;
    if (row.info.stage === 'NOTICE') retentionCounters.notice += 1;
    if (row.info.stage === 'FINAL_NOTICE') retentionCounters.final += 1;
    if (row.info.stage === 'DUE') retentionCounters.due += 1;
  }

  const recentDeletions = await loadRecentDeletions(admin);

  const visibleTransactions = transactions.slice(0, 120).map((transaction) => {
    const tenant = tenantNames.get(transaction.tenant_id);
    return {
      ...transaction,
      tenantName: tenant?.name ?? 'Comercio eliminado',
      tenantSlug: tenant?.slug ?? '—',
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalTenants: tenants.length,
      openTenants: enriched.filter((tenant) => tenant.isOpen).length,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions,
      mrr,
      collectedTotal,
      collectedThisMonth,
      ordersTotal: orders.length,
      ordersThisMonth,
      deliveredTotal,
      volumeDelivered,
      retentionAlerts:
        retentionCounters.notice + retentionCounters.final + retentionCounters.due,
    },
    planBreakdown,
    revenueSeries,
    tenants: enriched,
    transactions: visibleTransactions,
    retention: {
      policy: RETENTION_POLICY,
      ...retentionCounters,
    },
    recentDeletions,
  };
}

async function loadRecentDeletions(
  admin: SupabaseClient
): Promise<SuperAdminData['recentDeletions']> {
  const { data, error } = await admin
    .from('tenant_retention_events')
    .select('tenant_name, tenant_slug, created_at, metadata')
    .eq('event_type', 'PURGED')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];

  return (data ?? []).map((event) => ({
    tenantName: event.tenant_name as string,
    tenantSlug: event.tenant_slug as string,
    createdAt: event.created_at as string,
    orders:
      typeof event.metadata?.orders === 'number'
        ? (event.metadata.orders as number)
        : null,
  }));
}
