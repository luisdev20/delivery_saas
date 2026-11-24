'use client';

import { useState } from 'react';
import {
  X,
  Store,
  MapPin,
  Phone,
  Users,
  Truck,
  Bell,
  Clock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Copy,
  Check,
  Send,
  Receipt,
  Ban,
  Lock,
  Trash2,
  Shield,
  CalendarPlus,
  Banknote,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  PlanType,
  Restaurant,
  Subscription,
  TenantNotification,
  TenantNotificationSeverity,
  TenantNotificationType,
} from '@/lib/supabase/types';
import {
  formatDatePen,
  formatDateTimePen,
  formatPen,
  PAID_PLANS,
  PLAN_CATALOG,
  PAYMENT_METHOD_LABELS,
  type BillingTransaction,
  type SubscriptionSnapshot,
} from '@/lib/subscription';
import { getRetentionInfo, type RetentionInfo } from '@/lib/retention';
import type { TenantMetricsSummary } from '@/app/superadmin/page';

interface Props {
  tenant: Restaurant;
  subscription: Subscription | null;
  snapshot: SubscriptionSnapshot;
  metrics: TenantMetricsSummary;
  transactions: BillingTransaction[];
  onClose: () => void;
  onTenantUpdated: (tenant: Restaurant) => void;
  onSubscriptionUpdated: (subscription: Subscription) => void;
  onPaymentRecorded: (subscription: Subscription, transaction: BillingTransaction) => void;
  onTenantPurged: (tenantId: string, tenantName: string, tenantSlug: string) => void;
  onNotificationSent: (notifications: TenantNotification[]) => void;
}

const QUICK_TEMPLATES: {
  label: string;
  type: TenantNotificationType;
  severity: TenantNotificationSeverity;
  title: string;
  message: string;
}[] = [
  {
    label: 'Por vencer',
    type: 'SUBSCRIPTION_EXPIRING',
    severity: 'WARNING',
    title: 'Tu suscripción está próxima a vencer',
    message: 'Recuerda renovar tu plan desde Suscripción y Facturación para evitar pasar a modo solo lectura.',
  },
  {
    label: 'Suscripción vencida',
    type: 'SUBSCRIPTION_EXPIRED',
    severity: 'URGENT',
    title: 'Suscripción vencida · Acción requerida',
    message: 'Tu ciclo de facturación ha vencido y la operación se encuentra en modo solo lectura. Renueva tu plan para reanudar despachos.',
  },
  {
    label: 'Aviso general',
    type: 'GENERAL',
    severity: 'INFO',
    title: 'Comunicado de Delivery Tracker',
    message: 'El equipo de plataforma se ha comunicado contigo respecto al estado de tu cuenta.',
  },
];

export default function MerchantGovernanceDrawer({
  tenant,
  subscription,
  snapshot,
  metrics,
  transactions,
  onClose,
  onTenantUpdated,
  onSubscriptionUpdated,
  onPaymentRecorded,
  onTenantPurged,
  onNotificationSent,
}: Props) {
  const retentionInfo: RetentionInfo = getRetentionInfo({
    createdAt: tenant.created_at,
    subscription,
    lastTransaction: transactions[0] ?? null,
    extendedUntil: tenant.retention_extended_until ?? null,
    hold: Boolean(tenant.retention_hold),
  });

  // Notificación
  const [notifType, setNotifType] = useState<TenantNotificationType>('SUBSCRIPTION_EXPIRING');
  const [notifSeverity, setNotifSeverity] = useState<TenantNotificationSeverity>('WARNING');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  // Prórroga operativa
  const [graceDays, setGraceDays] = useState<number>(7);
  const [graceReason, setGraceReason] = useState('');
  const [grantingGrace, setGrantingGrace] = useState(false);

  // Registro manual de pago (cobranza presencial / mora)
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payPlan, setPayPlan] = useState<PlanType>(subscription?.plan ?? 'STARTER');
  const [payMethod, setPayMethod] = useState<'YAPE' | 'TARJETA'>('YAPE');
  const [payYapePhone, setPayYapePhone] = useState('');
  const [payCardLastFour, setPayCardLastFour] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  // Política de retención (30 días) y purga definitiva en cascada
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeSlugInput, setPurgeSlugInput] = useState('');
  const [purging, setPurging] = useState(false);

  // Cancelación de suscripción por soporte
  const [showCancelSub, setShowCancelSub] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingSub, setCancellingSub] = useState(false);

  // Suspensión / Reactivación de cuenta
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [togglingSuspend, setTogglingSuspend] = useState(false);

  // Recuperación de contraseña del owner
  const [resettingPwd, setResettingPwd] = useState(false);
  const [tempCreds, setTempCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copiedPwd, setCopiedPwd] = useState(false);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.error('Completa el título y el mensaje del aviso.');
      return;
    }
    setSendingNotif(true);
    try {
      const res = await fetch('/api/superadmin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantIds: [tenant.id],
          type: notifType,
          severity: notifSeverity,
          title: notifTitle,
          message: notifMessage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la notificación.');

      onNotificationSent((data.notifications ?? []) as TenantNotification[]);
      toast.success(`Notificación enviada a ${tenant.name}`);
      setNotifTitle('');
      setNotifMessage('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar notificación.');
    } finally {
      setSendingNotif(false);
    }
  };

  const handleGrantGrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!graceReason.trim()) {
      toast.error('Indica el motivo de la prórroga.');
      return;
    }
    setGrantingGrace(true);
    try {
      const res = await fetch('/api/superadmin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant_grace',
          tenantId: tenant.id,
          graceDays,
          reason: graceReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo otorgar la prórroga.');

      onSubscriptionUpdated(data.subscription as Subscription);
      toast.success(`Prórroga de ${graceDays} días otorgada a ${tenant.name}`);
      setGraceReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al otorgar prórroga.');
    } finally {
      setGrantingGrace(false);
    }
  };

  const handleCancelSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      toast.error('Registra el motivo de la baja de suscripción.');
      return;
    }
    setCancellingSub(true);
    try {
      const res = await fetch('/api/superadmin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_subscription',
          tenantId: tenant.id,
          reason: cancelReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desactivar la suscripción.');

      onSubscriptionUpdated(data.subscription as Subscription);
      toast.success(`Suscripción de ${tenant.name} desactivada por soporte.`);
      setShowCancelSub(false);
      setCancelReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al desactivar suscripción.');
    } finally {
      setCancellingSub(false);
    }
  };

  const handleSuspendToggle = async (action: 'suspend' | 'reactivate') => {
    if (action === 'suspend' && !suspendReason.trim()) {
      toast.error('Indica el motivo de la suspensión.');
      return;
    }
    setTogglingSuspend(true);
    try {
      const res = await fetch('/api/superadmin/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          tenantId: tenant.id,
          reason: action === 'suspend' ? suspendReason : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado de la cuenta.');

      onTenantUpdated(data.tenant as Restaurant);
      toast.success(
        action === 'suspend'
          ? `Cuenta de ${tenant.name} suspendida a nivel plataforma.`
          : `Cuenta de ${tenant.name} reactivada.`
      );
      setShowSuspendForm(false);
      setSuspendReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar cuenta.');
    } finally {
      setTogglingSuspend(false);
    }
  };

  const handleResetOwnerPassword = async () => {
    setResettingPwd(true);
    try {
      const res = await fetch('/api/superadmin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_owner_password',
          tenantId: tenant.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo restablecer la contraseña.');

      setTempCreds({ email: data.email, tempPassword: data.tempPassword });
      toast.success('Contraseña temporal generada. Cópiala y entrégala al propietario.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al restablecer contraseña.');
    } finally {
      setResettingPwd(false);
    }
  };

  const copyTempPassword = () => {
    if (!tempCreds) return;
    navigator.clipboard.writeText(tempCreds.tempPassword).then(() => {
      setCopiedPwd(true);
      setTimeout(() => setCopiedPwd(false), 2000);
    });
  };

  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecordingPay(true);
    try {
      const res = await fetch('/api/superadmin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          plan: payPlan,
          paymentMethod: payMethod,
          yapePhone: payMethod === 'YAPE' ? payYapePhone : undefined,
          cardLastFour: payMethod === 'TARJETA' ? payCardLastFour : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar el pago manual.');

      onPaymentRecorded(data.subscription as Subscription, data.transaction as BillingTransaction);
      toast.success(`Pago manual registrado (${data.transaction.transaction_code}). Ciclo renovado.`);
      setShowPaymentForm(false);
      setPayYapePhone('');
      setPayCardLastFour('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago.');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleRetentionAction = async (action: 'extend' | 'hold' | 'release') => {
    setRetentionBusy(true);
    try {
      const res = await fetch('/api/superadmin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          tenantId: tenant.id,
          days: action === 'extend' ? 30 : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la retención.');

      if (action === 'extend') {
        onTenantUpdated({ ...tenant, retention_extended_until: data.extendedUntil });
        toast.success(`Plazo de retención extendido hasta ${formatDatePen(data.extendedUntil)}.`);
      } else {
        onTenantUpdated({ ...tenant, retention_hold: Boolean(data.hold) });
        toast.success(
          data.hold
            ? 'Cuenta resguardada: excluida de la purga automática.'
            : 'Resguardo liberado: la cuenta vuelve al cronograma de retención.'
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al gestionar retención.');
    } finally {
      setRetentionBusy(false);
    }
  };

  const handlePurgeTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purgeSlugInput.trim() !== tenant.slug) {
      toast.error(`Escribe exactamente "${tenant.slug}" para confirmar la purga definitiva.`);
      return;
    }
    setPurging(true);
    try {
      const res = await fetch('/api/superadmin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purge',
          tenantId: tenant.id,
          confirmSlug: purgeSlugInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo ejecutar la purga definitiva.');

      toast.success(
        `Comercio "${tenant.name}" eliminado definitivamente (${data.authUsersDeleted ?? 0} cuenta(s) Auth purgada(s)).`
      );
      onTenantPurged(tenant.id, tenant.name, tenant.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ejecutar la purga.');
    } finally {
      setPurging(false);
    }
  };

  const statusPillClass: Record<string, string> = {
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    TRIAL: 'bg-sky-50 text-sky-700 border-sky-200',
    GRACE: 'bg-amber-50 text-amber-800 border-amber-200',
    EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
    SUSPENDED: 'bg-slate-900 text-white border-slate-900',
    NONE: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Store size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 truncate">{tenant.name}</h3>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusPillClass[snapshot.status]}`}>
                  {snapshot.statusLabel}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-500 mt-0.5">
                {tenant.slug} {tenant.ruc ? `· RUC ${tenant.ruc}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Aviso de privacidad */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500">
            <Lock size={13} className="text-slate-400 shrink-0" />
            <span>
              Vista de gobernanza: los pedidos, clientes y montos de venta internos del comercio permanecen privados.
            </span>
          </div>

          {/* Ficha estructural del comercio */}
          <section className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Plan y Consumo</p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {snapshot.planLabel} · {formatPen(snapshot.price)}/mes
              </p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {snapshot.ordersThisMonth} / {snapshot.maxOrders} envíos ({Math.round(snapshot.usagePercent)}%)
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200/80 bg-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Estructura Activa</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs font-semibold text-slate-800 tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <Users size={13} className="text-indigo-600" /> {metrics.totalAccounts} cuentas
                </span>
                <span className="inline-flex items-center gap-1">
                  <Truck size={13} className="text-emerald-600" /> {metrics.activeDrivers}/{snapshot.maxDrivers} flota
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 truncate" title={metrics.ownerEmail || undefined}>
                Owner: {metrics.ownerEmail || 'Sin propietario'}
              </p>
            </div>

            <div className="col-span-2 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-slate-400 shrink-0" />
                <span className="truncate">{tenant.address} (Radio {tenant.max_delivery_radius_km || 10} km)</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <Phone size={13} className="text-slate-400 shrink-0" />
                  {tenant.phone}
                </span>
                <span className="text-[11px] text-slate-400">
                  Alta: {formatDatePen(tenant.created_at)}
                </span>
              </div>
            </div>
          </section>

          {/* 1. Enviar Notificación Interna (Realtime) */}
          <section className="rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Bell size={14} className="text-indigo-600" />
                Notificar al Admin del Comercio
              </h4>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Tiempo real
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setNotifType(tpl.type);
                    setNotifSeverity(tpl.severity);
                    setNotifTitle(tpl.title);
                    setNotifMessage(tpl.message);
                  }}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 text-slate-600 transition-colors cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendNotification} className="space-y-2.5">
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="Título del aviso..."
                className="form-input text-xs py-2"
              />
              <textarea
                rows={2}
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder="Mensaje que aparecerá en la campana del panel administrativo..."
                className="form-input text-xs py-2 resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  value={notifSeverity}
                  onChange={(e) => setNotifSeverity(e.target.value as TenantNotificationSeverity)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium"
                >
                  <option value="INFO">Severidad: Informativa</option>
                  <option value="WARNING">Severidad: Advertencia</option>
                  <option value="URGENT">Severidad: Urgente</option>
                </select>
                <button
                  type="submit"
                  disabled={sendingNotif}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sendingNotif ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Enviar aviso
                </button>
              </div>
            </form>
          </section>

          {/* 2. Gestión de Suscripción: Prórroga / Baja por soporte */}
          <section className="rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" />
                Prórroga y Gobernanza de Suscripción
              </h4>
              {snapshot.isGrace && (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Hasta {snapshot.graceUntilLabel}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Los cambios de plan los realiza el comercio desde su panel de facturación. Desde aquí puedes otorgar días de gracia o desactivar una suscripción por soporte.
            </p>

            {subscription ? (
              <form onSubmit={handleGrantGrace} className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2">
                  {[3, 7, 15].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setGraceDays(days)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        graceDays === days
                          ? 'bg-amber-50 border-amber-400 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      +{days} días
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={graceReason}
                  onChange={(e) => setGraceReason(e.target.value)}
                  placeholder="Motivo obligatorio (ej. Pago en tránsito / acuerdo comercial)"
                  className="form-input text-xs py-2"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelSub((v) => !v)}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    {showCancelSub ? 'Cancelar baja' : 'Desactivar suscripción (soporte)'}
                  </button>
                  <button
                    type="submit"
                    disabled={grantingGrace}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {grantingGrace ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
                    Otorgar prórroga
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-400 italic">Este comercio no tiene suscripción creada aún.</p>
            )}

            {showCancelSub && subscription && (
              <form onSubmit={handleCancelSubscription} className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                <p className="text-[11px] font-semibold text-rose-900">
                  Desactivar suscripción activa (conserva el historial financiero)
                </p>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Motivo de la baja solicitada por el comercio..."
                  className="form-input text-xs py-1.5"
                />
                <button
                  type="submit"
                  disabled={cancellingSub}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {cancellingSub ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                  Confirmar baja de suscripción
                </button>
              </form>
            )}
          </section>

          {/* 3. Soporte de Cuenta: Recuperar Contraseña + Suspender/Reactivar */}
          <section className="rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <KeyRound size={14} className="text-slate-700" />
              Soporte de Acceso y Cuenta
            </h4>

            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
              <div>
                <p className="text-xs font-semibold text-slate-900">Recuperar acceso del propietario</p>
                <p className="text-[11px] text-slate-500">
                  Genera una contraseña temporal para {metrics.ownerEmail || 'el owner'}.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetOwnerPassword}
                disabled={resettingPwd || !metrics.ownerEmail}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-45"
              >
                {resettingPwd ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                Restablecer clave
              </button>
            </div>

            {tempCreds && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                <p className="text-[11px] font-bold text-emerald-900">
                  Contraseña temporal generada (se muestra una sola vez):
                </p>
                <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-emerald-200">
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500 truncate">{tempCreds.email}</p>
                    <p className="text-sm font-mono font-bold text-slate-900">{tempCreds.tempPassword}</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {copiedPwd ? <Check size={13} /> : <Copy size={13} />}
                    {copiedPwd ? 'Copiada' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Suspender o Reactivar cuenta a nivel plataforma */}
            {tenant.is_suspended ? (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-900">Cuenta suspendida</p>
                  <p className="text-[11px] text-rose-700 truncate">
                    {tenant.suspended_reason || 'Bloqueada por administración'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSuspendToggle('reactivate')}
                  disabled={togglingSuspend}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {togglingSuspend ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  Reactivar cuenta
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Suspensión de plataforma</p>
                    <p className="text-[11px] text-slate-500">
                      Bloquea la operación del comercio sin alterar su horario interno.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSuspendForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                  >
                    <ShieldAlert size={13} />
                    Suspender
                  </button>
                </div>

                {showSuspendForm && (
                  <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                    <input
                      type="text"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder="Motivo obligatorio de la suspensión..."
                      className="form-input text-xs py-1.5"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSuspendForm(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuspendToggle('suspend')}
                        disabled={togglingSuspend}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {togglingSuspend ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
                        Confirmar suspensión
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4. Registro Manual de Cobro (Regularización / Presencial) */}
          <section className="rounded-2xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Banknote size={14} className="text-emerald-600" />
                Registro Manual de Pago
              </h4>
              <button
                type="button"
                onClick={() => setShowPaymentForm((v) => !v)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                {showPaymentForm ? 'Ocultar' : 'Registrar cobro'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Para pagos coordinados por Yape o tarjeta fuera de la pasarela del comercio. Renueva el ciclo y genera comprobante auditado.
            </p>

            {showPaymentForm && (
              <form onSubmit={handleRecordManualPayment} className="space-y-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={payPlan}
                    onChange={(e) => setPayPlan(e.target.value as PlanType)}
                    className="form-input text-xs py-1.5 font-semibold"
                  >
                    {PAID_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_CATALOG[p].label} ({formatPen(PLAN_CATALOG[p].price)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as 'YAPE' | 'TARJETA')}
                    className="form-input text-xs py-1.5 font-semibold"
                  >
                    <option value="YAPE">Yape</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>

                {payMethod === 'YAPE' ? (
                  <input
                    type="text"
                    maxLength={9}
                    value={payYapePhone}
                    onChange={(e) => setPayYapePhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="Celular Yape (9 dígitos)"
                    className="form-input text-xs py-1.5 font-mono"
                    required
                  />
                ) : (
                  <input
                    type="text"
                    maxLength={4}
                    value={payCardLastFour}
                    onChange={(e) => setPayCardLastFour(e.target.value.replace(/\D/g, ''))}
                    placeholder="Últimos 4 dígitos de la tarjeta"
                    className="form-input text-xs py-1.5 font-mono"
                    required
                  />
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={recordingPay}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {recordingPay ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
                    Confirmar pago ({formatPen(PLAN_CATALOG[payPlan].price)})
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* 5. Política de Retención (30 días) y Purga Definitiva en Cascada */}
          <section className="rounded-2xl border border-rose-200/80 bg-rose-50/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <Trash2 size={14} className="text-rose-600" />
                Retención (30 días) y Purga Definitiva
              </h4>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                  retentionInfo.stage === 'HOLD'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : retentionInfo.stage === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}
              >
                {retentionInfo.stageLabel}
              </span>
            </div>

            <div className="text-[11px] text-slate-600 space-y-1">
              <p>{retentionInfo.detail}</p>
              {retentionInfo.stage !== 'ACTIVE' && retentionInfo.stage !== 'HOLD' && (
                <p className="font-semibold text-rose-800 tabular-nums">
                  Fecha límite de purga: {formatDatePen(retentionInfo.purgeAt)} ({retentionInfo.daysUntilPurge} día(s) restantes)
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={retentionBusy}
                onClick={() => handleRetentionAction(tenant.retention_hold ? 'release' : 'hold')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Shield size={12} />
                {tenant.retention_hold ? 'Liberar resguardo' : 'Resguardar cuenta'}
              </button>

              <button
                type="button"
                disabled={retentionBusy}
                onClick={() => handleRetentionAction('extend')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <CalendarPlus size={12} />
                Extender retención +30d
              </button>

              <button
                type="button"
                onClick={() => setShowPurgeConfirm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer ml-auto"
              >
                <Trash2 size={12} />
                Purgar comercio
              </button>
            </div>

            {showPurgeConfirm && (
              <form onSubmit={handlePurgeTenant} className="p-3 rounded-xl bg-white border border-rose-300 space-y-2.5">
                <p className="text-[11px] text-rose-900 font-semibold leading-relaxed">
                  Acción irreversible: eliminará en cascada el comercio, sus pedidos, motorizados, API keys y cuentas de acceso sin otra membresía. Escribe <code className="font-mono bg-rose-50 px-1.5 py-0.5 rounded font-bold">{tenant.slug}</code> para confirmar:
                </p>
                <input
                  type="text"
                  value={purgeSlugInput}
                  onChange={(e) => setPurgeSlugInput(e.target.value)}
                  placeholder={tenant.slug}
                  className="form-input text-xs py-1.5 font-mono"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPurgeConfirm(false);
                      setPurgeSlugInput('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={purging || purgeSlugInput.trim() !== tenant.slug}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    {purging ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Confirmar purga definitiva
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* 6. Comprobantes SaaS del comercio */}
          <section className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Receipt size={14} className="text-slate-500" />
              Pagos de Suscripción ({transactions.length})
            </h4>
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-400">Sin comprobantes de suscripción registrados.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
                {transactions.slice(0, 6).map((tx) => (
                  <div key={tx.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white">
                    <div>
                      <p className="font-semibold text-slate-800">
                        Plan {tx.plan_selected} · {PAYMENT_METHOD_LABELS[tx.payment_method] ?? tx.payment_method}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {tx.transaction_code} · {formatDateTimePen(tx.created_at)}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatPen(tx.amount_pen)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
