'use client';

import { ArrowUpRight, Gauge } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
}

export default function OrderQuotaWidget({ snapshot, onOpenBilling }: Props) {
  const percent = Math.min(100, Math.max(0, snapshot.usagePercent));
  const barColor =
    snapshot.quotaState === 'exhausted'
      ? '#E11D48'
      : snapshot.quotaState === 'warning'
        ? '#D97706'
        : '#10B981';

  return (
    <div
      id="order-quota-widget"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 flex flex-col justify-between gap-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Gauge size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider leading-tight truncate">
              Cuota · {snapshot.planLabel}
            </p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight mt-0.5 tabular-nums">
              {snapshot.ordersThisMonth}
              <span className="text-xs font-semibold text-slate-400">
                {' '}
                / {snapshot.maxOrders.toLocaleString('es-PE')}
              </span>
            </p>
          </div>
        </div>

        {(snapshot.quotaState !== 'normal' || snapshot.isExpired || !snapshot.hasSubscription) && (
          <button
            type="button"
            onClick={onOpenBilling}
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 shrink-0 cursor-pointer"
          >
            {snapshot.isExpired ? 'Renovar' : 'Ampliar'}
            <ArrowUpRight size={12} />
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${percent}%`, backgroundColor: barColor }}
            role="progressbar"
            aria-valuenow={Math.round(snapshot.usagePercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
          <span>{Math.round(snapshot.usagePercent)}% consumido</span>
          <span className="truncate">
            {snapshot.isExpired ? `Venció ${snapshot.renewalDateLabel}` : `Ciclo: ${snapshot.renewalDateLabel}`}
          </span>
        </div>
      </div>
    </div>
  );
}
