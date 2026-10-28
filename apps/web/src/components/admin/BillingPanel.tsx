'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight, CalendarDays, Check, CreditCard, Loader2, Receipt,
  RefreshCw, ShieldCheck, Smartphone, Sparkles, X,
} from 'lucide-react';
import type { Restaurant, Subscription, PlanType } from '@/lib/supabase/types';
import {
  PAYMENT_METHOD_LABELS, PLAN_CATALOG, PAID_PLANS, formatDatePen, formatDateTimePen,
  formatPen, type BillingTransaction, type SubscriptionSnapshot,
} from '@/lib/subscription';

interface Props {
  tenant: Restaurant;
  subscription: Subscription | null;
  snapshot: SubscriptionSnapshot;
  transactions: BillingTransaction[];
  onSubscriptionUpdated: (subscription: Subscription, transaction: BillingTransaction) => void;
}

type ModalMode = 'renew' | 'change' | null;

interface PaymentForm {
  plan: PlanType;
  method: 'YAPE' | 'TARJETA';
  yapePhone: string;
  yapeCode: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

function emptyPaymentForm(plan: PlanType): PaymentForm {
  return {
    plan,
    method: 'YAPE',
    yapePhone: '',
    yapeCode: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
  };
}

export default function BillingPanel({
  tenant,
  subscription,
  snapshot,
  transactions,
  onSubscriptionUpdated,
}: Props) {
  const [mode, setMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<PaymentForm>(emptyPaymentForm(snapshot.plan));
  const [saving, setSaving] = useState(false);

  const planOptions = useMemo(() => PAID_PLANS, []);

  const openModal = (nextMode: Exclude<ModalMode, null>) => {
    const plan = subscription?.plan ?? 'STARTER';
    setForm(emptyPaymentForm(plan));
    setMode(nextMode);
  };

  const closeModal = () => {
    if (saving) return;
    setMode(null);
  };

  const amount = PLAN_CATALOG[form.plan]?.price ?? 0;

  const validate = (): string | null => {
    if (form.method === 'YAPE') {
      if (form.yapePhone.replace(/\D/g, '').length !== 9) {
        return 'Ingresa el celular de Yape (9 dígitos).';
      }
      if (form.yapeCode.replace(/\D/g, '').length !== 6) {
        return 'Ingresa el código de aprobación de 6 dígitos.';
      }
      return null;
    }
    if (form.cardNumber.replace(/\D/g, '').length !== 16) {
      return 'Ingresa los 16 dígitos de la tarjeta.';
    }
    if (!/^\d{2}\/\d{2}$/.test(form.cardExpiry.trim())) {
      return 'Ingresa el vencimiento en formato MM/AA.';
    }
    if (form.cardCvv.replace(/\D/g, '').length !== 3) {
      return 'Ingresa el CVV de 3 dígitos.';
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'renew' ? 'renew' : 'change_plan',
          tenantId: tenant.id,
          plan: form.plan,
          paymentMethod: form.method,
          yapePhone: form.yapePhone,
          cardNumber: form.cardNumber,
          cardExpiry: form.cardExpiry,
          cardCvv: form.cardCvv,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar el pago simulado.');
      }

      onSubscriptionUpdated(data.subscription as Subscription, data.transaction as BillingTransaction);
      toast.success(
        mode === 'renew'
          ? `Suscripción renovada. Comprobante ${data.transaction.transaction_code}`
          : `Plan ${PLAN_CATALOG[form.plan].label} activado. Comprobante ${data.transaction.transaction_code}`
      );
      setMode(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar la suscripción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              Suscripción y Facturación
            </h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              {snapshot.planLabel}
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Auditoría del contrato, ciclo de cobro e historial financiero de {tenant.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscription && (
            <button
              type="button"
              onClick={() => openModal('renew')}
              className="btn btn-secondary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5"
              id="btn-renew-subscription"
            >
              <RefreshCw size={15} /> Renovar Suscripción
            </button>
          )}
          <button
            type="button"
            onClick={() => openModal('change')}
            className="btn btn-indigo text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5"
            id="btn-change-plan"
          >
            <Sparkles size={15} /> {subscription ? 'Cambiar de Plan' : 'Contratar Plan'}
          </button>
        </div>
      </header>

      {/* Resumen del plan actual */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div
          className={`px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            snapshot.isExpired
              ? 'bg-rose-50 border-rose-200'
              : snapshot.plan === 'ENTERPRISE'
                ? 'bg-slate-900 border-slate-800 text-white'
                : snapshot.plan === 'GROWTH'
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div>
            <p
              className={`text-[10px] font-black uppercase tracking-widest ${
                snapshot.isExpired
                  ? 'text-rose-600'
                  : snapshot.plan === 'ENTERPRISE'
                    ? 'text-amber-300'
                    : 'text-slate-500'
              }`}
            >
              Plan actual
            </p>
            <p className="text-2xl font-black tracking-tight">
              {snapshot.planLabel}
              <span
                className={`ml-2 text-xs font-bold ${
                  snapshot.plan === 'ENTERPRISE' ? 'text-white/60' : 'text-slate-500'
                }`}
              >
                {subscription ? formatPen(snapshot.price) : 'Sin contrato'} / mes
              </span>
            </p>
          </div>
          <span
            className={`self-start sm:self-auto inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full ${
              snapshot.isExpired
                ? 'bg-rose-600 text-white'
                : snapshot.isTrial
                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                  : 'bg-emerald-600 text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
            {snapshot.statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <CalendarDays size={12} /> Inicio del ciclo
            </p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {snapshot.billingCycleStart
                ? formatDatePen(snapshot.billingCycleStart)
                : '—'}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <RefreshCw size={12} /> Próxima renovación
            </p>
            <p className="mt-1 text-sm font-bold text-slate-800">{snapshot.renewalDateLabel}</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <ShieldCheck size={12} /> Días restantes
            </p>
            <p
              className={`mt-1 text-sm font-bold ${
                snapshot.isExpired ? 'text-rose-600' : 'text-slate-800'
              }`}
            >
              {snapshot.isExpired
                ? 'Servicio vencido'
                : `${snapshot.daysRemaining} día${snapshot.daysRemaining === 1 ? '' : 's'}`}
              {snapshot.isTrial && !snapshot.isExpired && (
                <span className="ml-1.5 text-[10px] font-bold text-sky-600 uppercase">
                  de prueba
                </span>
              )}
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Receipt size={12} /> Límites incluidos
            </p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              {snapshot.maxDrivers} motorizados · {snapshot.maxOrders.toLocaleString('es-PE')}{' '}
              pedidos
            </p>
          </div>
        </div>
      </div>

      {/* Historial de transacciones */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Receipt size={16} className="text-indigo-600" /> Historial de Transacciones
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprobantes emitidos para este comercio
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">
            {transactions.length} registro{transactions.length === 1 ? '' : 's'}
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Receipt size={34} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold text-slate-600">Aún no hay transacciones</p>
            <p className="text-xs mt-1">
              Los cobros de suscripción aparecerán aquí con su código de comprobante.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" id="billing-history-table">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Comprobante</th>
                  <th className="py-3 px-4">Fecha y hora</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4">Monto</th>
                  <th className="py-3 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-bold text-indigo-700">
                        {transaction.transaction_code}
                      </span>
                      <span className="block text-[10px] text-slate-400 uppercase">
                        {transaction.plan_selected}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTimePen(transaction.created_at)}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                      {PAYMENT_METHOD_LABELS[transaction.payment_method] ??
                        transaction.payment_method}
                      {transaction.card_last_four && (
                        <span className="ml-1 text-[10px] font-mono text-slate-400">
                          •••• {transaction.card_last_four}
                        </span>
                      )}
                      {transaction.yape_phone_number && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          {transaction.yape_phone_number}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs font-black text-slate-800">
                      {formatPen(Number(transaction.amount_pen))}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        <Check size={10} /> {transaction.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de pago simulado */}
      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {mode === 'renew' ? 'Renovar Suscripción' : 'Cambiar de Plan'}
                </h3>
                <p className="text-xs text-slate-500">
                  Pasarela simulada en Soles (PEN) · sin costo de inscripción
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <p className="form-label text-xs font-semibold uppercase mb-2">Plan</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {planOptions.map((planKey) => {
                    const plan = PLAN_CATALOG[planKey];
                    const selected = form.plan === planKey;
                    const disabled = mode === 'renew' && subscription?.plan !== planKey;
                    return (
                      <button
                        type="button"
                        key={planKey}
                        disabled={disabled}
                        onClick={() => setForm((prev) => ({ ...prev, plan: planKey }))}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          selected
                            ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100'
                            : 'border-slate-200 hover:border-slate-300'
                        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className="block text-xs font-black text-slate-800">
                          {plan.label}
                        </span>
                        <span className="block text-sm font-black text-indigo-700">
                          {formatPen(plan.price)}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-1">
                          {plan.maxDrivers} motorizados · {plan.maxOrders} pedidos
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="form-label text-xs font-semibold uppercase mb-2">Método de pago</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, method: 'YAPE' }))}
                    className={`rounded-xl border p-3 flex items-center gap-2 text-sm font-bold transition-all ${
                      form.method === 'YAPE'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Smartphone size={16} /> Yape
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, method: 'TARJETA' }))}
                    className={`rounded-xl border p-3 flex items-center gap-2 text-sm font-bold transition-all ${
                      form.method === 'TARJETA'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <CreditCard size={16} /> Tarjeta
                  </button>
                </div>
              </div>

              {form.method === 'YAPE' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold uppercase">
                      Celular Yape
                    </label>
                    <input
                      className="form-input"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="999999999"
                      value={form.yapePhone}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          yapePhone: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold uppercase">
                      Código de aprobación
                    </label>
                    <input
                      className="form-input"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={form.yapeCode}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          yapeCode: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      required
                    />
                  </div>
                  <p className="col-span-2 text-[11px] text-slate-500">
                    Sandbox: usa cualquier celular de 9 dígitos y código de 6 dígitos.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold uppercase">
                      Número de tarjeta
                    </label>
                    <input
                      className="form-input font-mono"
                      inputMode="numeric"
                      maxLength={16}
                      placeholder="4111111111111111"
                      value={form.cardNumber}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          cardNumber: e.target.value.replace(/\D/g, ''),
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold uppercase">
                        Vencimiento
                      </label>
                      <input
                        className="form-input"
                        maxLength={5}
                        placeholder="MM/AA"
                        value={form.cardExpiry}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                          const formatted =
                            digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                          setForm((prev) => ({ ...prev, cardExpiry: formatted }));
                        }}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold uppercase">CVV</label>
                      <input
                        className="form-input"
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="123"
                        value={form.cardCvv}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            cardCvv: e.target.value.replace(/\D/g, ''),
                          }))
                        }
                        required
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Sandbox: no se realiza ningún cargo real. Solo se guardan los últimos 4 dígitos.
                  </p>
                </div>
              )}

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Total a pagar</span>
                <span className="text-lg font-black text-slate-900">{formatPen(amount)}</span>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="btn btn-secondary flex-1 text-xs sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-indigo flex-1 text-xs sm:text-sm font-bold flex items-center justify-center gap-2"
                  id="btn-confirm-payment"
                >
                  {saving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Procesando…
                    </>
                  ) : (
                    <>
                      Confirmar pago <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
