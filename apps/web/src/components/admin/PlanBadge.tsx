'use client';

import { ChevronRight, CreditCard, ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
  collapsed?: boolean;
}

export default function PlanBadge({ snapshot, onOpenBilling, collapsed = false }: Props) {
  const isSuspended = snapshot.isSuspended;
  const isExpired = snapshot.isExpired;
  const isGrace = snapshot.isGrace;
  const isEnterprise = snapshot.plan === 'ENTERPRISE' && !isExpired;
  const isGrowth = snapshot.plan === 'GROWTH' && !isExpired;

  const statusTone = isSuspended || isExpired
    ? 'border-rose-400/35 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15'
    : isGrace
      ? 'border-amber-400/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
      : isEnterprise
        ? 'border-amber-300/30 bg-white/[0.06] text-amber-200 hover:bg-white/[0.10]'
        : isGrowth
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
          : 'border-white/10 bg-white/[0.05] text-indigo-100 hover:bg-white/[0.09]';

  const dotClass = isSuspended || isExpired
    ? 'bg-rose-400'
    : isGrace
      ? 'bg-amber-400'
      : 'bg-emerald-400';

  const statusSubtitle = !snapshot.hasSubscription
    ? 'Sin contrato'
    : isSuspended
      ? 'Suspendida'
      : isGrace
        ? `Prórroga · ${snapshot.daysRemaining}d`
        : isExpired
          ? `Venció ${snapshot.renewalDateLabel}`
          : snapshot.isTrial
            ? `Prueba · ${snapshot.daysRemaining}d`
            : `Renueva ${snapshot.renewalDateLabel}`;

  const Icon = isSuspended || isExpired
    ? AlertCircle
    : isGrace
      ? Clock
      : isEnterprise
        ? ShieldCheck
        : CreditCard;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onOpenBilling}
        id="sidebar-plan-badge"
        title={`Plan ${snapshot.planLabel} · ${statusSubtitle}`}
        className={`relative w-10 h-10 mx-auto rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${statusTone}`}
      >
        <Icon size={16} />
        <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotClass}`} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenBilling}
      id="sidebar-plan-badge"
      title="Ver suscripción y facturación"
      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${statusTone}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate leading-tight">
            Plan {snapshot.planLabel}
          </p>
          <p className="text-[10px] text-white/60 truncate leading-tight mt-0.5 tabular-nums">
            {statusSubtitle}
          </p>
        </div>
      </div>
      <ChevronRight size={14} className="text-white/40 shrink-0" />
    </button>
  );
}
