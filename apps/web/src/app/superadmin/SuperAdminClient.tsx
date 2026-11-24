'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Store,
  Plus,
  AlertTriangle,
  Wallet,
  Users,
  Search,
  Menu,
  Bell,
  Clock,
  SlidersHorizontal,
  CheckCircle2,
  Send,
  Loader2,
  ShieldAlert,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type {
  PlanType,
  Restaurant,
  Subscription,
  TenantNotification,
} from '@/lib/supabase/types';
import {
  PLAN_CATALOG,
  PAID_PLANS,
  getSubscriptionSnapshot,
  formatPen,
  formatDatePen,
  formatDateTimePen,
  type BillingTransaction,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from '@/lib/subscription';
import type { TenantMetricsSummary } from './page';
import SuperAdminSidebar, { type SuperAdminTab } from '@/components/superadmin/SuperAdminSidebar';
import MerchantGovernanceDrawer from '@/components/superadmin/MerchantGovernanceDrawer';
import CreateMerchantModal from '@/components/superadmin/CreateMerchantModal';
import SuperAdminMetricsView from '@/components/superadmin/SuperAdminMetricsView';
import TablePagination from '@/components/superadmin/TablePagination';

interface Props {
  tenants: Restaurant[];
  subscriptions: Subscription[];
  transactions: BillingTransaction[];
  tenantMetrics: TenantMetricsSummary[];
  initialNotifications: TenantNotification[];
  notificationsReady: boolean;
  userEmail?: string | null;
}

interface EnrichedMerchant {
  tenant: Restaurant;
  subscription: Subscription | null;
  lastTransaction: BillingTransaction | null;
  transactions: BillingTransaction[];
  snapshot: SubscriptionSnapshot;
  metrics: TenantMetricsSummary;
}

const TAB_HEADER: Record<SuperAdminTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Resumen de Plataforma',
    subtitle: 'Salud de suscripciones, ingresos SaaS y comercios que requieren atención',
  },
  metrics: {
    title: 'Métricas de Plataforma',
    subtitle: 'Evolución de ingresos SaaS, distribución por plan, altas y salud de cartera',
  },
  merchants: {
    title: 'Directorio de Comercios',
    subtitle: 'Gobernanza de cuentas, capacidad operativa, soporte y prórrogas',
  },
  subscriptions: {
    title: 'Suscripciones y Vencimientos',
    subtitle: 'Control de ciclos comerciales, alertas de cobranza y distribución de planes',
  },
  notifications: {
    title: 'Notificaciones Enviadas',
    subtitle: 'Historial de avisos internos entregados en tiempo real a los comercios',
  },
};

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  TRIAL: { label: 'Prueba 14d', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  GRACE: { label: 'Prórroga', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  EXPIRED: { label: 'Vencido', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  SUSPENDED: { label: 'Suspendido', className: 'bg-slate-900 text-white border-slate-900' },
  NONE: { label: 'Sin plan', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function SuperAdminClient({
  tenants: initialTenants,
  subscriptions: initialSubscriptions,
  transactions: initialTransactions,
  tenantMetrics: initialMetrics,
  initialNotifications,
  notificationsReady,
  userEmail,
}: Props) {
  const [tenants, setTenants] = useState<Restaurant[]>(initialTenants);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [transactions, setTransactions] = useState<BillingTransaction[]>(initialTransactions);
  const [metricsList, setMetricsList] = useState<TenantMetricsSummary[]>(initialMetrics);
  const [notifications, setNotifications] = useState<TenantNotification[]>(initialNotifications);

  const [activeTab, setActiveTab] = useState<SuperAdminTab>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  // Filtros y paginación
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SubscriptionStatus>('ALL');
  const [planFilter, setPlanFilter] = useState<'ALL' | PlanType>('ALL');
  const [sendingBulk, setSendingBulk] = useState(false);

  const [merchantsPage, setMerchantsPage] = useState(1);
  const [merchantsPageSize, setMerchantsPageSize] = useState(10);
  const [subsPage, setSubsPage] = useState(1);
  const [subsPageSize, setSubsPageSize] = useState(10);
  const [notifsPage, setNotifsPage] = useState(1);
  const [notifsPageSize, setNotifsPageSize] = useState(10);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dtk_superadmin_sidebar_collapsed');
      if (saved === 'true') setCollapsed(true);
    } catch {}
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dtk_superadmin_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleLogout = async () => {
    document.cookie = 'dtk_role=; path=/; max-age=0';
    document.cookie = 'dtk_tenant=; path=/; max-age=0';
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = '/login';
  };

  // Enriquecer comercios con suscripción más reciente, comprobantes SaaS y métricas agregadas
  const enrichedMerchants: EnrichedMerchant[] = useMemo(() => {
    const metricsMap = new Map(metricsList.map((m) => [m.tenantId, m]));
    return tenants.map((tenant) => {
      const sub = subscriptions.find((s) => (s.tenant_id || s.restaurant_id) === tenant.id) ?? null;
      const tenantTxs = transactions.filter((tx) => tx.tenant_id === tenant.id);
      const lastTx = tenantTxs[0] ?? null;
      const snapshot = getSubscriptionSnapshot(sub, lastTx, new Date(), {
        isSuspended: Boolean(tenant.is_suspended),
        suspendedReason: tenant.suspended_reason ?? null,
      });
      const metrics = metricsMap.get(tenant.id) ?? {
        tenantId: tenant.id,
        activeDrivers: 0,
        totalAccounts: 0,
        ownerEmail: null,
      };
      return {
        tenant,
        subscription: sub,
        lastTransaction: lastTx,
        transactions: tenantTxs,
        snapshot,
        metrics,
      };
    });
  }, [tenants, subscriptions, transactions, metricsList]);

  const tenantNameById = useMemo(
    () => new Map(tenants.map((t) => [t.id, t.name])),
    [tenants]
  );

  // KPIs estrictamente de gobernanza SaaS (sin orders.total_amount)
  const kpis = useMemo(() => {
    const totalMerchants = enrichedMerchants.length;
    const activeMerchants = enrichedMerchants.filter((m) =>
      ['ACTIVE', 'TRIAL', 'GRACE'].includes(m.snapshot.status)
    ).length;
    const suspendedMerchants = enrichedMerchants.filter(
      (m) => m.snapshot.status === 'SUSPENDED'
    ).length;
    const expiredMerchants = enrichedMerchants.filter(
      (m) => m.snapshot.status === 'EXPIRED' || m.snapshot.status === 'NONE'
    );
    const expiringSoonMerchants = enrichedMerchants.filter(
      (m) =>
        ['ACTIVE', 'TRIAL', 'GRACE'].includes(m.snapshot.status) &&
        m.snapshot.daysRemaining <= 5
    );

    // Ingresos SaaS del mes actual (desde billing_transactions de Delivery Tracker)
    const now = new Date();
    const monthRevenuePen = transactions
      .filter((tx) => {
        const d = new Date(tx.created_at);
        return (
          tx.status === 'PAID' &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        );
      })
      .reduce((acc, tx) => acc + Number(tx.amount_pen || 0), 0);

    // MRR estimado por planes activos
    const estimatedMrr = enrichedMerchants
      .filter((m) => m.snapshot.status === 'ACTIVE')
      .reduce((acc, m) => acc + m.snapshot.price, 0);

    const totalAccounts = metricsList.reduce((acc, m) => acc + m.totalAccounts, 0);
    const totalActiveDrivers = metricsList.reduce((acc, m) => acc + m.activeDrivers, 0);

    return {
      totalMerchants,
      activeMerchants,
      suspendedMerchants,
      expiredMerchants,
      expiringSoonMerchants,
      atRiskCount: expiredMerchants.length + expiringSoonMerchants.length,
      monthRevenuePen,
      estimatedMrr,
      totalAccounts,
      totalActiveDrivers,
    };
  }, [enrichedMerchants, transactions, metricsList]);

  // Comercios ordenados por urgencia de suscripción (vencidos hace más tiempo primero)
  const urgentMerchants = useMemo(() => {
    const priority = (m: EnrichedMerchant) => {
      if (m.snapshot.status === 'EXPIRED') return 0;
      if (m.snapshot.status === 'NONE') return 1;
      if (m.snapshot.status === 'GRACE') return 2;
      if (['ACTIVE', 'TRIAL'].includes(m.snapshot.status) && m.snapshot.daysRemaining <= 5) return 3;
      if (m.snapshot.status === 'SUSPENDED') return 4;
      return 5;
    };

    return [...enrichedMerchants].sort((a, b) => {
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      if (a.snapshot.daysOverdue !== b.snapshot.daysOverdue) {
        return b.snapshot.daysOverdue - a.snapshot.daysOverdue;
      }
      return a.snapshot.daysRemaining - b.snapshot.daysRemaining;
    });
  }, [enrichedMerchants]);

  const filteredMerchants = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return enrichedMerchants.filter((m) => {
      if (statusFilter !== 'ALL' && m.snapshot.status !== statusFilter) return false;
      if (planFilter !== 'ALL' && m.snapshot.plan !== planFilter) return false;
      if (q) {
        const matchName = m.tenant.name.toLowerCase().includes(q);
        const matchSlug = m.tenant.slug.toLowerCase().includes(q);
        const matchRuc = (m.tenant.ruc || '').toLowerCase().includes(q);
        const matchEmail = (m.metrics.ownerEmail || '').toLowerCase().includes(q);
        if (!matchName && !matchSlug && !matchRuc && !matchEmail) return false;
      }
      return true;
    });
  }, [enrichedMerchants, searchTerm, statusFilter, planFilter]);

  const paginatedMerchants = useMemo(() => {
    const start = (merchantsPage - 1) * merchantsPageSize;
    return filteredMerchants.slice(start, start + merchantsPageSize);
  }, [filteredMerchants, merchantsPage, merchantsPageSize]);

  const paginatedSubscriptions = useMemo(() => {
    const start = (subsPage - 1) * subsPageSize;
    return urgentMerchants.slice(start, start + subsPageSize);
  }, [urgentMerchants, subsPage, subsPageSize]);

  const paginatedNotifications = useMemo(() => {
    const start = (notifsPage - 1) * notifsPageSize;
    return notifications.slice(start, start + notifsPageSize);
  }, [notifications, notifsPage, notifsPageSize]);

  const attentionMerchants = useMemo(
    () => urgentMerchants.filter((m) => m.snapshot.status !== 'ACTIVE' || m.snapshot.daysRemaining <= 5),
    [urgentMerchants]
  );

  const selectedMerchant = useMemo(
    () => enrichedMerchants.find((m) => m.tenant.id === selectedTenantId) ?? null,
    [enrichedMerchants, selectedTenantId]
  );

  const handleNotifyAllExpired = async () => {
    const targetIds = kpis.expiredMerchants.map((m) => m.tenant.id);
    if (targetIds.length === 0) {
      toast.info('No hay comercios con suscripción vencida para notificar.');
      return;
    }

    setSendingBulk(true);
    try {
      const res = await fetch('/api/superadmin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantIds: targetIds,
          type: 'SUBSCRIPTION_EXPIRED',
          severity: 'URGENT',
          title: 'Recordatorio: tu suscripción está vencida',
          message:
            'Tu panel opera en modo solo lectura. Renueva tu plan desde Suscripción y Facturación para reactivar tus despachos.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron enviar las notificaciones.');

      setNotifications((prev) => [
        ...((data.notifications ?? []) as TenantNotification[]),
        ...prev,
      ]);
      toast.success(`Aviso enviado en tiempo real a ${data.sentCount} comercio(s) vencido(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar notificaciones masivas.');
    } finally {
      setSendingBulk(false);
    }
  };

  const renderCycleLabel = (snapshot: SubscriptionSnapshot) => {
    if (snapshot.status === 'SUSPENDED') {
      return <span className="text-xs font-semibold text-slate-600">Cuenta bloqueada</span>;
    }
    if (snapshot.status === 'GRACE') {
      return (
        <span className="text-xs font-semibold text-amber-700 tabular-nums">
          Prórroga · {snapshot.daysRemaining}d (hasta {snapshot.graceUntilLabel})
        </span>
      );
    }
    if (snapshot.status === 'EXPIRED') {
      return (
        <span className="text-xs font-semibold text-rose-600 tabular-nums">
          Venció hace {snapshot.daysOverdue}d ({snapshot.renewalDateLabel})
        </span>
      );
    }
    if (snapshot.status === 'NONE') {
      return <span className="text-xs text-slate-400">Sin suscripción</span>;
    }
    return (
      <span className={`text-xs tabular-nums ${snapshot.daysRemaining <= 5 ? 'font-bold text-amber-700' : 'text-slate-600'}`}>
        Quedan {snapshot.daysRemaining}d · {snapshot.renewalDateLabel}
      </span>
    );
  };

  const headerMeta = TAB_HEADER[activeTab];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Sidebar Obsidian colapsable */}
      <SuperAdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        totalMerchants={kpis.totalMerchants}
        atRiskCount={kpis.atRiskCount}
        notificationsCount={notifications.length}
        userEmail={userEmail}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Área principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Topbar limpio */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
              aria-label="Abrir navegación"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {headerMeta.title}
              </h2>
              <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                {headerMeta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg">
              <Lock size={12} className="text-emerald-600" />
              Datos internos de comercios protegidos
            </span>

            <button
              type="button"
              id="btn-register-merchant"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Registrar Comercio</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
          </div>
        </header>

        {/* Aviso si falta aplicar migración 013 */}
        {!notificationsReady && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 sm:px-6 py-2 text-xs text-amber-900 flex items-center gap-2 shrink-0">
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            <span>
              Ejecuta <code className="font-mono font-bold">supabase/migrations/014_superadmin_governance_and_notifications.sql</code> en Supabase para habilitar notificaciones en tiempo real, prórrogas y suspensión de plataforma.
            </span>
          </div>
        )}

        {/* Contenido por pestaña */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 animate-fade-in">
          {/* ================= TAB 1: RESUMEN DE PLATAFORMA ================= */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                    <Store size={19} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Comercios Activos
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5 tabular-nums">
                      {kpis.activeMerchants}
                      <span className="text-sm font-semibold text-slate-400"> / {kpis.totalMerchants}</span>
                    </p>
                    {kpis.suspendedMerchants > 0 && (
                      <p className="text-[11px] text-rose-600 font-medium mt-0.5">
                        {kpis.suspendedMerchants} suspendido(s)
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('subscriptions')}
                  className="bg-white rounded-2xl border border-slate-200/80 hover:border-rose-300 shadow-2xs p-4 flex items-center gap-3.5 text-left transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={19} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Suscripciones en Riesgo
                    </p>
                    <p className="text-2xl font-extrabold text-rose-600 leading-tight mt-0.5 tabular-nums">
                      {kpis.atRiskCount}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {kpis.expiredMerchants.length} vencidas · {kpis.expiringSoonMerchants.length} por vencer
                    </p>
                  </div>
                </button>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Wallet size={19} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Ingresos SaaS (Mes)
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5 tabular-nums">
                      {formatPen(kpis.monthRevenuePen)}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-medium mt-0.5 tabular-nums">
                      MRR activo: {formatPen(kpis.estimatedMrr)}
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Users size={19} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Capacidad Registrada
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 leading-tight mt-0.5 tabular-nums">
                      {kpis.totalAccounts}
                      <span className="text-xs font-semibold text-slate-400"> cuentas</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {kpis.totalActiveDrivers} repartidores activos
                    </p>
                  </div>
                </div>
              </div>

              {/* Bloque de atención inmediata */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Comercios que Requieren Atención
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Priorizados por días de vencimiento, prórrogas activas o renovación próxima (≤5 días)
                    </p>
                  </div>
                  {kpis.expiredMerchants.length > 0 && (
                    <button
                      type="button"
                      onClick={handleNotifyAllExpired}
                      disabled={sendingBulk}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {sendingBulk ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Notificar a todos los vencidos ({kpis.expiredMerchants.length})
                    </button>
                  )}
                </div>

                {attentionMerchants.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <CheckCircle2 size={30} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-800">
                      Todas las suscripciones están saludables
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      No hay cuentas vencidas, suspendidas ni próximas a vencer.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-slate-100">
                      {attentionMerchants.slice(0, 6).map((m) => {
                        const badge = STATUS_BADGE[m.snapshot.status];
                        return (
                          <div
                            key={m.tenant.id}
                            className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                                <Store size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-slate-900 truncate">{m.tenant.name}</p>
                                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                  <span className="text-[11px] font-medium text-slate-500">
                                    Plan {m.snapshot.planLabel}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                                  {renderCycleLabel(m.snapshot)}
                                  <span>·</span>
                                  <span className="tabular-nums">
                                    {m.metrics.totalAccounts} cuentas · {m.metrics.activeDrivers} repartidores
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setSelectedTenantId(m.tenant.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <SlidersHorizontal size={13} />
                                Gestionar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {attentionMerchants.length > 6 && (
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setActiveTab('subscriptions')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 cursor-pointer"
                        >
                          Ver los {attentionMerchants.length} comercios en Suscripciones
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ================= TAB 2: MÉTRICAS DE PLATAFORMA ================= */}
          {activeTab === 'metrics' && (
            <SuperAdminMetricsView
              merchants={enrichedMerchants.map((m) => ({
                tenant: m.tenant,
                snapshot: m.snapshot,
                activeDrivers: m.metrics.activeDrivers,
                totalAccounts: m.metrics.totalAccounts,
              }))}
              transactions={transactions}
            />
          )}

          {/* ================= TAB 2: DIRECTORIO DE COMERCIOS ================= */}
          {activeTab === 'merchants' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              {/* Barra de búsqueda y filtros */}
              <div className="p-4 border-b border-slate-200/80 bg-slate-50/60 flex flex-col lg:flex-row gap-2.5 lg:items-center justify-between">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setMerchantsPage(1);
                    }}
                    placeholder="Buscar por nombre, slug, RUC o correo del propietario..."
                    className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as 'ALL' | SubscriptionStatus);
                      setMerchantsPage(1);
                    }}
                    className="h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="ALL">Estado: Todos</option>
                    <option value="ACTIVE">Activos</option>
                    <option value="TRIAL">Prueba 14d</option>
                    <option value="GRACE">En prórroga</option>
                    <option value="EXPIRED">Vencidos</option>
                    <option value="SUSPENDED">Suspendidos</option>
                  </select>

                  <select
                    value={planFilter}
                    onChange={(e) => {
                      setPlanFilter(e.target.value as 'ALL' | PlanType);
                      setMerchantsPage(1);
                    }}
                    className="h-9 bg-white border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="ALL">Plan: Todos</option>
                    {PAID_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_CATALOG[p].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200/80">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Comercio</th>
                      <th className="py-3 px-4 font-semibold">Plan y Estado</th>
                      <th className="py-3 px-4 font-semibold">Vigencia / Ciclo</th>
                      <th className="py-3 px-4 font-semibold">Cuota del Mes</th>
                      <th className="py-3 px-4 font-semibold">Cuentas y Flota</th>
                      <th className="py-3 px-4 font-semibold text-right">Gobernanza</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMerchants.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No se encontraron comercios con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      paginatedMerchants.map((m) => {
                        const badge = STATUS_BADGE[m.snapshot.status];
                        const pct = Math.min(100, Math.round(m.snapshot.usagePercent));
                        return (
                          <tr
                            key={m.tenant.id}
                            onClick={() => setSelectedTenantId(m.tenant.id)}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                                  <Store size={15} />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 text-sm truncate">{m.tenant.name}</p>
                                  <p className="text-[11px] font-mono text-slate-400 truncate">
                                    {m.tenant.slug} {m.tenant.ruc ? `· ${m.tenant.ruc}` : ''}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-800">{m.snapshot.planLabel}</span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                                {formatPen(m.snapshot.price)}/mes
                              </p>
                            </td>
                            <td className="py-3.5 px-4">{renderCycleLabel(m.snapshot)}</td>
                            <td className="py-3.5 px-4 min-w-[140px]">
                              <div className="flex items-center justify-between text-[11px] tabular-nums mb-1">
                                <span className="font-bold text-slate-800">{m.snapshot.ordersThisMonth}</span>
                                <span className="text-slate-400">/ {m.snapshot.maxOrders}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor:
                                      m.snapshot.quotaState === 'exhausted'
                                        ? '#E11D48'
                                        : m.snapshot.quotaState === 'warning'
                                          ? '#D97706'
                                          : '#10B981',
                                  }}
                                />
                              </div>
                            </td>
                            <td className="py-3.5 px-4 tabular-nums">
                              <p className="font-semibold text-slate-800">{m.metrics.totalAccounts} cuentas</p>
                              <p className="text-[11px] text-slate-500">
                                {m.metrics.activeDrivers} / {m.snapshot.maxDrivers} repartidores
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedTenantId(m.tenant.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                              >
                                <SlidersHorizontal size={12} />
                                Gestionar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredMerchants.length > 0 && (
                <TablePagination
                  totalItems={filteredMerchants.length}
                  currentPage={merchantsPage}
                  pageSize={merchantsPageSize}
                  onPageChange={setMerchantsPage}
                  onPageSizeChange={setMerchantsPageSize}
                  itemLabel="comercios"
                />
              )}
            </div>
          )}

          {/* ================= TAB 3: SUSCRIPCIONES Y PLANES ================= */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-5">
              {/* Tarjetas de catálogo comercial desde PLAN_CATALOG */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PAID_PLANS.map((planKey) => {
                  const plan = PLAN_CATALOG[planKey];
                  const subsInPlan = enrichedMerchants.filter((m) => m.snapshot.plan === planKey);
                  const activeInPlan = subsInPlan.filter((m) => m.snapshot.status === 'ACTIVE').length;
                  return (
                    <div
                      key={planKey}
                      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-base text-slate-900">{plan.label}</h4>
                        <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-full tabular-nums">
                          {formatPen(plan.price)}/mes
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3 tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Cuota mensual</span>
                          <span className="font-semibold text-slate-900">
                            {plan.maxOrders.toLocaleString('es-PE')} pedidos/mes
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Flota máxima</span>
                          <span className="font-semibold text-slate-900">{plan.maxDrivers} repartidores</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs tabular-nums">
                        <span className="text-slate-500">
                          Comercios: <strong className="text-slate-900">{subsInPlan.length}</strong> ({activeInPlan} activos)
                        </span>
                        <span className="font-bold text-emerald-700">
                          {formatPen(activeInPlan * plan.price)}/mes
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabla de control de vencimientos */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Control de Vencimientos y Cobranza</h3>
                    <p className="text-xs text-slate-500">
                      Ordenado por urgencia: cuentas vencidas hace más días aparecen primero
                    </p>
                  </div>
                  {kpis.expiredMerchants.length > 0 && (
                    <button
                      type="button"
                      onClick={handleNotifyAllExpired}
                      disabled={sendingBulk}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {sendingBulk ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                      Notificar vencidos ({kpis.expiredMerchants.length})
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200/80">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Comercio</th>
                        <th className="py-3 px-4 font-semibold">Plan</th>
                        <th className="py-3 px-4 font-semibold">Estado</th>
                        <th className="py-3 px-4 font-semibold">Inicio Ciclo</th>
                        <th className="py-3 px-4 font-semibold">Vencimiento / Prórroga</th>
                        <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedSubscriptions.map((m) => {
                        const badge = STATUS_BADGE[m.snapshot.status];
                        return (
                          <tr key={m.tenant.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {m.tenant.name}
                              <span className="block text-[11px] font-normal text-slate-400">
                                {m.metrics.ownerEmail || m.tenant.slug}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-700 tabular-nums">
                              {m.snapshot.planLabel} ({formatPen(m.snapshot.price)})
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 tabular-nums">
                              {formatDatePen(m.snapshot.billingCycleStart)}
                            </td>
                            <td className="py-3.5 px-4">{renderCycleLabel(m.snapshot)}</td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setSelectedTenantId(m.tenant.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                              >
                                <Clock size={12} />
                                Prórroga / Avisar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {urgentMerchants.length > 0 && (
                  <TablePagination
                    totalItems={urgentMerchants.length}
                    currentPage={subsPage}
                    pageSize={subsPageSize}
                    onPageChange={setSubsPage}
                    onPageSizeChange={setSubsPageSize}
                    itemLabel="suscripciones"
                  />
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 4: HISTORIAL DE NOTIFICACIONES ================= */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Bitácora de Notificaciones Enviadas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Avisos enviados al panel administrativo de cada comercio vía Realtime
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                  {notifications.length} registros
                </span>
              </div>

              {notifications.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <Bell size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Aún no se han enviado notificaciones</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Abre cualquier comercio y utiliza la sección &ldquo;Notificar al Admin del Comercio&rdquo;.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {paginatedNotifications.map((n) => (
                    <div key={n.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            n.severity === 'URGENT'
                              ? 'bg-rose-50 text-rose-600'
                              : n.severity === 'WARNING'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-indigo-50 text-indigo-600'
                          }`}
                        >
                          {n.severity === 'URGENT' ? <ShieldAlert size={15} /> : <Bell size={15} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">
                              {tenantNameById.get(n.tenant_id) || 'Comercio'}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="text-xs font-semibold text-slate-700">{n.title}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <span
                          className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            n.is_read
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {n.is_read ? 'Leída' : 'Pendiente'}
                        </span>
                        <p className="text-[10px] text-slate-400 tabular-nums">
                          {formatDateTimePen(n.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {notifications.length > 0 && (
                <TablePagination
                  totalItems={notifications.length}
                  currentPage={notifsPage}
                  pageSize={notifsPageSize}
                  onPageChange={setNotifsPage}
                  onPageSizeChange={setNotifsPageSize}
                  itemLabel="notificaciones"
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Drawer lateral de gestión de comercio */}
      {selectedMerchant && (
        <MerchantGovernanceDrawer
          tenant={selectedMerchant.tenant}
          subscription={selectedMerchant.subscription}
          snapshot={selectedMerchant.snapshot}
          metrics={selectedMerchant.metrics}
          transactions={selectedMerchant.transactions}
          onClose={() => setSelectedTenantId(null)}
          onTenantUpdated={(updated) =>
            setTenants((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
          }
          onSubscriptionUpdated={(updated) =>
            setSubscriptions((prev) => {
              const exists = prev.some((s) => s.id === updated.id);
              return exists
                ? prev.map((s) => (s.id === updated.id ? updated : s))
                : [updated, ...prev];
            })
          }
          onNotificationSent={(sent) =>
            setNotifications((prev) => [...sent, ...prev])
          }
        />
      )}

      {/* Modal de Alta Presencial */}
      <CreateMerchantModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={({ tenant, subscription, transaction, ownerEmail }) => {
          setTenants((prev) => [tenant, ...prev]);
          setSubscriptions((prev) => [subscription, ...prev]);
          if (transaction) setTransactions((prev) => [transaction, ...prev]);
          setMetricsList((prev) => [
            { tenantId: tenant.id, activeDrivers: 0, totalAccounts: 1, ownerEmail },
            ...prev,
          ]);
        }}
      />
    </div>
  );
}
