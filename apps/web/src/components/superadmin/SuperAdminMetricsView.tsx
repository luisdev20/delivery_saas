'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  PieChart,
  CreditCard,
  Store,
  Wallet,
  Activity,
} from 'lucide-react';
import type { Restaurant } from '@/lib/supabase/types';
import {
  PLAN_CATALOG,
  PAID_PLANS,
  PAYMENT_METHOD_LABELS,
  formatPen,
  type BillingTransaction,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from '@/lib/subscription';

export interface MetricsMerchantItem {
  tenant: Restaurant;
  snapshot: SubscriptionSnapshot;
  activeDrivers: number;
  totalAccounts: number;
}

interface Props {
  merchants: MetricsMerchantItem[];
  transactions: BillingTransaction[];
}

interface MonthBucket {
  key: string;
  label: string;
  revenue: number;
  txCount: number;
  newMerchants: number;
}

const HEALTH_SERIES: {
  status: SubscriptionStatus;
  label: string;
  color: string;
  bgDot: string;
}[] = [
  { status: 'ACTIVE', label: 'Activos', color: '#10B981', bgDot: 'bg-emerald-500' },
  { status: 'TRIAL', label: 'Prueba 14d', color: '#0EA5E9', bgDot: 'bg-sky-500' },
  { status: 'GRACE', label: 'En prórroga', color: '#F59E0B', bgDot: 'bg-amber-500' },
  { status: 'EXPIRED', label: 'Vencidos', color: '#F43F5E', bgDot: 'bg-rose-500' },
  { status: 'SUSPENDED', label: 'Suspendidos', color: '#334155', bgDot: 'bg-slate-700' },
];

const PLAN_COLORS: Record<string, string> = {
  STARTER: '#6366F1',
  GROWTH: '#10B981',
  ENTERPRISE: '#0F172A',
};

function buildMonthBuckets(monthsBack: number): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rawLabel = d.toLocaleDateString('es-PE', { month: 'short' }).replace('.', '');
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    buckets.push({ key, label, revenue: 0, txCount: 0, newMerchants: 0 });
  }
  return buckets;
}

export default function SuperAdminMetricsView({ merchants, transactions }: Props) {
  const [monthsRange, setMonthsRange] = useState<6 | 12>(6);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  // 1. Serie mensual: Ingresos SaaS + Altas de comercios
  const monthlySeries = useMemo(() => {
    const buckets = buildMonthBuckets(monthsRange);
    const map = new Map(buckets.map((b) => [b.key, b]));

    for (const tx of transactions) {
      if (tx.status !== 'PAID') continue;
      const d = new Date(tx.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.revenue += Number(tx.amount_pen || 0);
        bucket.txCount += 1;
      }
    }

    for (const m of merchants) {
      const d = new Date(m.tenant.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = map.get(key);
      if (bucket) {
        bucket.newMerchants += 1;
      }
    }

    return buckets;
  }, [transactions, merchants, monthsRange]);

  const totalPeriodRevenue = useMemo(
    () => monthlySeries.reduce((acc, b) => acc + b.revenue, 0),
    [monthlySeries]
  );
  const totalPeriodTx = useMemo(
    () => monthlySeries.reduce((acc, b) => acc + b.txCount, 0),
    [monthlySeries]
  );
  const avgMonthlyRevenue = monthlySeries.length > 0 ? totalPeriodRevenue / monthlySeries.length : 0;
  const maxMonthRevenue = Math.max(100, ...monthlySeries.map((b) => b.revenue));
  const maxNewMerchants = Math.max(1, ...monthlySeries.map((b) => b.newMerchants));

  // 2. Salud de suscripciones (para Dona SVG)
  const healthStats = useMemo(() => {
    const total = merchants.length;
    const counts = HEALTH_SERIES.map((s) => ({
      ...s,
      count: merchants.filter((m) => m.snapshot.status === s.status).length,
    }));
    const healthyCount = merchants.filter((m) =>
      ['ACTIVE', 'TRIAL', 'GRACE'].includes(m.snapshot.status)
    ).length;
    const healthRate = total > 0 ? Math.round((healthyCount / total) * 100) : 0;

    // Calcular arcos de la dona (circunferencia r=42 -> ~263.89)
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = counts
      .filter((c) => c.count > 0)
      .map((c) => {
        const ratio = total > 0 ? c.count / total : 0;
        const dash = ratio * circumference;
        const segment = {
          ...c,
          ratio,
          dash,
          offset,
        };
        offset += dash;
        return segment;
      });

    return { total, counts, healthyCount, healthRate, radius, circumference, segments };
  }, [merchants]);

  // 3. Distribución por Plan y MRR
  const planStats = useMemo(() => {
    const total = Math.max(1, merchants.length);
    return PAID_PLANS.map((planKey) => {
      const cfg = PLAN_CATALOG[planKey];
      const items = merchants.filter((m) => m.snapshot.plan === planKey);
      const activeCount = items.filter((m) => m.snapshot.status === 'ACTIVE').length;
      const mrr = activeCount * cfg.price;
      const share = Math.round((items.length / total) * 100);
      return {
        planKey,
        label: cfg.label,
        price: cfg.price,
        count: items.length,
        activeCount,
        mrr,
        share,
        color: PLAN_COLORS[planKey] ?? '#4F46E5',
      };
    });
  }, [merchants]);

  const totalMrr = useMemo(
    () => planStats.reduce((acc, p) => acc + p.mrr, 0),
    [planStats]
  );

  // 4. Métodos de pago SaaS
  const paymentMethodStats = useMemo(() => {
    const methods: ('YAPE' | 'TARJETA' | 'TRIAL')[] = ['YAPE', 'TARJETA', 'TRIAL'];
    const totalTx = Math.max(1, transactions.length);
    return methods.map((method) => {
      const txs = transactions.filter((tx) => tx.payment_method === method);
      const amount = txs.reduce((acc, tx) => acc + Number(tx.amount_pen || 0), 0);
      const pct = Math.round((txs.length / totalTx) * 100);
      return {
        method,
        label: PAYMENT_METHOD_LABELS[method],
        count: txs.length,
        amount,
        pct,
      };
    });
  }, [transactions]);

  const arpu = useMemo(() => {
    const activePaying = merchants.filter((m) => m.snapshot.status === 'ACTIVE').length;
    return activePaying > 0 ? totalMrr / activePaying : 0;
  }, [merchants, totalMrr]);

  const activeHoveredBucket = monthlySeries.find((b) => b.key === hoveredMonth) ?? null;

  return (
    <div className="space-y-5">
      {/* Barra superior de rango y KPIs sintéticos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity size={15} className="text-emerald-600" />
          <span>Indicadores financieros y de adopción calculados únicamente sobre suscripciones SaaS.</span>
        </div>

        <div className="inline-flex bg-white border border-slate-200/80 p-1 rounded-xl shadow-2xs self-start">
          {([6, 12] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setMonthsRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                monthsRange === range
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Últimos {range} meses
            </button>
          ))}
        </div>
      </div>

      {/* Mini KPIs ejecutivos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Recaudación ({monthsRange}m)
          </p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {formatPen(totalPeriodRevenue)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {totalPeriodTx} pagos registrados
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            MRR Recurrente
          </p>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            {formatPen(totalMrr)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            Promedio mensual: {formatPen(avgMonthlyRevenue)}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            ARPU (Ticket Activo)
          </p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {formatPen(arpu)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Ingreso medio por comercio activo</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Salud de Cartera
          </p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {healthStats.healthRate}%
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            {healthStats.healthyCount} de {healthStats.total} comercios operativos
          </p>
        </div>
      </div>

      {/* Fila principal de gráficos: Ingresos Mensuales + Salud de Suscripciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico 1: Barras de Ingresos SaaS */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wallet size={16} className="text-emerald-600" />
                Ingresos SaaS por Mes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cobros confirmados en <code className="font-mono text-[11px]">billing_transactions</code>
              </p>
            </div>
            {activeHoveredBucket ? (
              <div className="text-right bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs tabular-nums">
                <span className="font-bold">{activeHoveredBucket.label}:</span>{' '}
                {formatPen(activeHoveredBucket.revenue)} ({activeHoveredBucket.txCount} pagos)
              </div>
            ) : (
              <span className="text-[11px] font-medium text-slate-400">
                Pasa el cursor sobre una barra
              </span>
            )}
          </div>

          <div className="h-52 flex items-end gap-2 sm:gap-3 pt-6 pb-1 border-b border-slate-100">
            {monthlySeries.map((b) => {
              const heightPct = Math.max(4, Math.round((b.revenue / maxMonthRevenue) * 100));
              const isHovered = hoveredMonth === b.key;
              return (
                <div
                  key={b.key}
                  onMouseEnter={() => setHoveredMonth(b.key)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 group cursor-pointer"
                >
                  <span
                    className={`text-[10px] font-bold tabular-nums transition-opacity ${
                      b.revenue > 0 ? 'text-slate-700 opacity-100' : 'text-slate-300 opacity-70'
                    }`}
                  >
                    {b.revenue > 0 ? `S/${Math.round(b.revenue)}` : '0'}
                  </span>
                  <div className="w-full max-w-[44px] flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-xl transition-all duration-300 ${
                        b.revenue > 0
                          ? isHovered
                            ? 'bg-emerald-500'
                            : 'bg-slate-900 group-hover:bg-emerald-500'
                          : 'bg-slate-100'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 pt-2">
            {monthlySeries.map((b) => (
              <div key={b.key} className="flex-1 text-center text-[11px] font-medium text-slate-500">
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 2: Dona SVG de Salud de Suscripciones */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChart size={16} className="text-indigo-600" />
              Salud de Suscripciones
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Estado actual de la cartera</p>
          </div>

          <div className="my-4 flex items-center justify-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                <circle
                  cx="55"
                  cy="55"
                  r={healthStats.radius}
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth="12"
                />
                {healthStats.segments.map((seg) => (
                  <circle
                    key={seg.status}
                    cx="55"
                    cy="55"
                    r={healthStats.radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="12"
                    strokeDasharray={`${seg.dash} ${healthStats.circumference - seg.dash}`}
                    strokeDashoffset={-seg.offset}
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                  {healthStats.healthRate}%
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Operativos
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            {healthStats.counts.map((item) => (
              <div key={item.status} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.bgDot}`} />
                  <span>{item.label}</span>
                </div>
                <span className="font-bold text-slate-900 tabular-nums">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Segunda fila: Distribución por Plan + Altas de Comercios + Métodos de Pago */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico 3: Distribución por Plan y MRR */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Store size={16} className="text-slate-700" />
              Distribución por Plan
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Comercios y aporte al MRR activo</p>
          </div>

          <div className="space-y-3.5">
            {planStats.map((p) => (
              <div key={p.planKey} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">
                    {p.label}{' '}
                    <span className="font-normal text-slate-400">({p.count})</span>
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatPen(p.mrr)}
                    <span className="text-slate-400 font-normal">/m</span>
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(p.count > 0 ? 6 : 0, p.share)}%`, backgroundColor: p.color }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 tabular-nums">
                  <span>{p.share}% del total</span>
                  <span>{p.activeCount} activos</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 4: Crecimiento de Comercios */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600" />
              Altas de Comercios
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nuevos negocios registrados por mes
            </p>
          </div>

          <div className="h-36 flex items-end gap-2 pt-5 pb-1 border-b border-slate-100">
            {monthlySeries.map((b) => {
              const hPct = Math.max(6, Math.round((b.newMerchants / maxNewMerchants) * 100));
              return (
                <div key={b.key} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-bold text-slate-700 tabular-nums">
                    {b.newMerchants > 0 ? `+${b.newMerchants}` : '0'}
                  </span>
                  <div className="w-full max-w-[30px] flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-lg ${
                        b.newMerchants > 0 ? 'bg-indigo-600' : 'bg-slate-100'
                      }`}
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2">
            {monthlySeries.map((b) => (
              <div key={b.key} className="flex-1 text-center text-[10px] font-medium text-slate-500">
                {b.label}
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 5: Métodos de Pago SaaS */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard size={16} className="text-slate-700" />
              Métodos de Pago SaaS
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Preferencia de cobro en suscripciones</p>
          </div>

          <div className="space-y-3">
            {paymentMethodStats.map((pm) => {
              const color =
                pm.method === 'YAPE'
                  ? '#7C3AED'
                  : pm.method === 'TARJETA'
                    ? '#0F172A'
                    : '#0EA5E9';
              return (
                <div key={pm.method} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{pm.label}</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatPen(pm.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pm.pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
                    <span>{pm.count} transacciones</span>
                    <span>{pm.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
