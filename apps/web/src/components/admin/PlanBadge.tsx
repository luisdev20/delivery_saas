'use client';

import { ChevronRight, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
}

export default function PlanBadge({ snapshot, onOpenBilling }: Props) {
  const isExpired = snapshot.isExpired;
  const isGrowth = snapshot.plan === 'GROWTH' && !isExpired;
  const isEnterprise = snapshot.plan === 'ENTERPRISE' && !isExpired;

  const containerClass = isExpired
    ? 'border-rose-400/60 bg-rose-500/10'
    : isEnterprise
      ? 'border-amber-400/50 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 ring-1 ring-amber-300/20'
      : isGrowth
        ? 'border-emerald-500/50 bg-emerald-500/10'
        : 'border-slate-500/60 bg-indigo-900/40';

  const labelClass = isExpired
    ? 'text-rose-200'
    : isEnterprise
      ? 'text-amber-200'
      : isGrowth
        ? 'text-emerald-200'
        : 'text-indigo-100';

  return (
    <button
      type="button"
      onClick={onOpenBilling}
      className={`w-full text-left rounded-xl border p-3 transition-all hover:brightness-110 ${containerClass}`}
      id="sidebar-plan-badge"
      title="Ver suscripción y facturación"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              isEnterprise ? 'bg-amber-400/20 text-amber-200' : 'bg-white/10 text-white'
            }`}
          >
            {isEnterprise ? <ShieldCheck size={15} /> : <CreditCard size={15} />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/50">
              Plan actual
            </p>
            <p className={`text-sm font-black truncate ${labelClass}`}>
              {snapshot.planLabel}
              {isEnterprise && (
                <span className="ml-1.5 text-[9px] font-black uppercase text-amber-300/90">
                  Institucional
                </span>
              )}
            </p>
          </div>
        </div>
        <ChevronRight size={14} className="text-white/40 shrink-0 mt-1" />
      </div>

      <p className="mt-2 text-[10px] font-semibold text-white/70">
        {!snapshot.hasSubscription
          ? 'Sin contrato activo'
          : snapshot.isExpired
            ? `Venció ${snapshot.renewalDateLabel}`
            : snapshot.isTrial
              ? `Prueba · ${snapshot.daysRemaining} día${snapshot.daysRemaining === 1 ? '' : 's'}`
              : snapshot.periodEnd
                ? `Renueva ${snapshot.renewalDateLabel}`
                : 'Sin ciclo de cobro'}
      </p>

      {!snapshot.isExpired && !snapshot.isTrial && snapshot.daysRemaining <= 5 && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-amber-200">
          <Sparkles size={10} />
          {snapshot.daysRemaining === 0
            ? 'Vence hoy'
            : `Quedan ${snapshot.daysRemaining} día${snapshot.daysRemaining === 1 ? '' : 's'}`}
        </p>
      )}
    </button>
  );
}
