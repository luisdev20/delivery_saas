import type { PlanType, Subscription } from '@/lib/supabase/types';

/**
 * Catálogo comercial de planes.
 *
 * Los límites reflejan el contrato comercial del onboarding
 * (landing `billing-portal`): Starter 2/300, Growth 5/1,000 y
 * Enterprise 99/3,000. La base de datos sigue siendo la fuente de
 * verdad para los límites efectivos de cada suscripción.
 */
export const PLAN_CATALOG: Record<
  PlanType,
  { label: string; price: number; maxDrivers: number; maxOrders: number }
> = {
  STARTER: { label: 'Starter', price: 99, maxDrivers: 2, maxOrders: 300 },
  GROWTH: { label: 'Growth', price: 199, maxDrivers: 5, maxOrders: 1000 },
  ENTERPRISE: { label: 'Enterprise', price: 399, maxDrivers: 99, maxOrders: 3000 },
};

export const PAID_PLANS: PlanType[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];

export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'NONE';
export type QuotaState = 'normal' | 'warning' | 'exhausted';

export type PaymentMethodLabel = 'YAPE' | 'TARJETA' | 'TRIAL';

export interface BillingTransaction {
  id: string;
  tenant_id: string;
  plan_selected: string;
  amount_pen: number;
  payment_method: PaymentMethodLabel;
  card_last_four: string | null;
  yape_phone_number: string | null;
  transaction_code: string;
  status: string;
  created_at: string;
}

export interface SubscriptionSnapshot {
  hasSubscription: boolean;
  plan: PlanType;
  planLabel: string;
  price: number;
  maxDrivers: number;
  maxOrders: number;
  ordersThisMonth: number;
  usagePercent: number;
  quotaState: QuotaState;
  status: SubscriptionStatus;
  statusLabel: string;
  isTrial: boolean;
  isExpired: boolean;
  isActive: boolean;
  billingCycleStart: string | null;
  periodEnd: string | null;
  renewalDateLabel: string;
  daysRemaining: number;
  /** Bloquea creación/edición de pedidos y asignación de motorizados. */
  readOnly: boolean;
  /** Bloquea únicamente la creación de nuevos pedidos. */
  quotaReached: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Convierte `billing_cycle_start` (DATE `YYYY-MM-DD`) a un instante UTC estable. */
export function parseCycleStart(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

/** Suma meses conservando el día cuando es posible (31 ene -> 28/29 feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatDatePen(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTimePen(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPen(amount: number): string {
  return `S/ ${Number(amount || 0).toFixed(2)}`;
}

/** Fecha comercial (YYYY-MM-DD) en la zona horaria del negocio (Perú). */
export function todayInPen(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function quotaStateFor(ordersThisMonth: number, maxOrders: number): QuotaState {
  if (maxOrders <= 0) return 'exhausted';
  const percent = (ordersThisMonth / maxOrders) * 100;
  if (percent >= 100) return 'exhausted';
  if (percent >= 80) return 'warning';
  return 'normal';
}

export function trialEndsAt(subscription: Pick<Subscription, 'billing_cycle_start'>): Date {
  return addDaysUtc(parseCycleStart(subscription.billing_cycle_start), 14);
}

export function subscriptionPeriodEnd(
  subscription: Pick<Subscription, 'billing_cycle_start'>,
  isTrial: boolean
): Date {
  const start = parseCycleStart(subscription.billing_cycle_start);
  return isTrial ? addDaysUtc(start, 14) : addMonthsUtc(start, 1);
}

/**
 * Deriva el estado contractual que usan el sidebar, el guard global y
 * el panel de facturación. No muta datos ni depende del navegador.
 */
export function getSubscriptionSnapshot(
  subscription: Subscription | null,
  lastTransaction: BillingTransaction | null,
  now: Date = new Date()
): SubscriptionSnapshot {
  if (!subscription) {
    return {
      hasSubscription: false,
      plan: 'STARTER',
      planLabel: 'Sin plan',
      price: 0,
      maxDrivers: PLAN_CATALOG.STARTER.maxDrivers,
      maxOrders: PLAN_CATALOG.STARTER.maxOrders,
      ordersThisMonth: 0,
      usagePercent: 0,
      quotaState: 'normal',
      status: 'NONE',
      statusLabel: 'Sin suscripción',
      isTrial: false,
      isExpired: true,
      isActive: false,
      billingCycleStart: null,
      periodEnd: null,
      renewalDateLabel: '—',
      daysRemaining: 0,
      readOnly: true,
      quotaReached: false,
    };
  }

  const catalog = PLAN_CATALOG[subscription.plan] ?? PLAN_CATALOG.STARTER;
  const maxDrivers = Number(subscription.max_drivers) || catalog.maxDrivers;
  const maxOrders = Number(subscription.max_orders_per_month) || catalog.maxOrders;
  const ordersThisMonth = Number(subscription.orders_this_month) || 0;
  const usagePercent = maxOrders > 0 ? (ordersThisMonth / maxOrders) * 100 : 100;
  const quotaState = quotaStateFor(ordersThisMonth, maxOrders);
  const isTrial = lastTransaction?.payment_method === 'TRIAL' && subscription.plan === 'STARTER';

  const periodEnd = subscriptionPeriodEnd(subscription, isTrial);
  const periodEndIso = periodEnd.toISOString();
  const isExpired = subscription.is_active === false || now.getTime() >= periodEnd.getTime();
  const daysRemaining = isExpired
    ? 0
    : Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS));

  let status: SubscriptionStatus;
  let statusLabel: string;
  if (isExpired) {
    status = 'EXPIRED';
    statusLabel = isTrial ? 'Prueba vencida' : 'Vencido';
  } else if (isTrial) {
    status = 'TRIAL';
    statusLabel = 'Prueba 14 días';
  } else {
    status = 'ACTIVE';
    statusLabel = 'Activo';
  }

  return {
    hasSubscription: true,
    plan: subscription.plan,
    planLabel: catalog.label,
    price: catalog.price,
    maxDrivers,
    maxOrders,
    ordersThisMonth,
    usagePercent,
    quotaState,
    status,
    statusLabel,
    isTrial,
    isExpired,
    isActive: subscription.is_active !== false,
    billingCycleStart: subscription.billing_cycle_start,
    periodEnd: periodEndIso,
    renewalDateLabel: formatDatePen(periodEnd),
    daysRemaining,
    readOnly: isExpired,
    quotaReached: quotaState === 'exhausted',
  };
}

/** Mensaje único para el bloqueo por cuota (frontend y API). */
export function quotaReachedMessage(planLabel: string, maxOrders: number): string {
  return `Límite de pedidos alcanzado para el ciclo actual (${planLabel}: ${maxOrders} pedidos/mes).`;
}

/** Mensaje único para el bloqueo por vencimiento (frontend y API). */
export function expiredSubscriptionMessage(planLabel: string): string {
  return `Tu suscripción ${planLabel} está vencida. El panel se encuentra en modo solo lectura.`;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodLabel, string> = {
  YAPE: 'Yape',
  TARJETA: 'Tarjeta',
  TRIAL: 'Trial',
};
