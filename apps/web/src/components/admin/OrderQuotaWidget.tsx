'use client';

import { AlertTriangle, ArrowUpRight, Package } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
}

export default function OrderQuotaWidget({ snapshot, onOpenBilling }: Props) {
  if (!snapshot.hasSubscription) {
    return (
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4 sm:mb-6"
        id="order-quota-widget"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <Package size={18} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Cuota mensual de pedidos
              </p>
              <p className="text-sm font-black text-slate-800">Sin suscripción activa</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenBilling}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white"
          >
            Elegir plan <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  const percent = Math.min(100, Math.max(0, snapshot.usagePercent));
  const barColor =
    snapshot.quotaState === 'exhausted'
      ? '#DC2626'
      : snapshot.quotaState === 'warning'
        ? '#D97706'
        : '#059669';

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 mb-4 sm:mb-6"
      id="order-quota-widget"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Package size={18} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cuota mensual de pedidos
            </p>
            <p className="text-sm font-black text-slate-800">
              {snapshot.ordersThisMonth} / {snapshot.maxOrders} pedidos
              <span className="ml-2 text-[10px] font-bold uppercase text-slate-400">
                Plan {snapshot.planLabel}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold ${
              snapshot.quotaState === 'exhausted'
                ? 'text-red-600'
                : snapshot.quotaState === 'warning'
                  ? 'text-amber-600'
                  : 'text-slate-400'
            }`}
          >
            {Math.round(snapshot.usagePercent)}% consumido
          </span>
          {(snapshot.quotaState !== 'normal' || snapshot.isExpired) && (
            <button
              type="button"
              onClick={onOpenBilling}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
            >
              Ampliar plan <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
          role="progressbar"
          aria-valuenow={Math.round(snapshot.usagePercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {snapshot.quotaState === 'exhausted' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <AlertTriangle size={13} />
          Límite de pedidos alcanzado para el ciclo actual.
        </p>
      ) : snapshot.quotaState === 'warning' ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <AlertTriangle size={13} />
          Estás al {Math.round(snapshot.usagePercent)}% de tu cuota mensual. Considera subir de plan
          para evitar pausas en el servicio.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">
          Consumo del ciclo actual · renueva antes del {snapshot.renewalDateLabel}
        </p>
      )}
    </div>
  );
}
