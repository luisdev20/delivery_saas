'use client';

import { AlertTriangle, ArrowRight, Clock, Info, ShieldAlert } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
}

export default function SubscriptionBanner({ snapshot, onOpenBilling }: Props) {
  if (snapshot.isSuspended) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-rose-200 bg-rose-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="alert"
        id="subscription-suspended-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldAlert size={16} className="text-rose-600 shrink-0" />
          <p className="text-xs text-rose-900 truncate">
            <strong className="font-bold">Cuenta suspendida por administración.</strong>{' '}
            <span className="text-rose-700">
              {snapshot.suspendedReason
                ? `Motivo: ${snapshot.suspendedReason}`
                : 'El panel opera en modo solo lectura hasta regularizar tu cuenta con soporte.'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (snapshot.isGrace) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-amber-200 bg-amber-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="status"
        id="subscription-grace-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock size={16} className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-900 truncate">
            <strong className="font-bold">
              Período de prórroga activo hasta {snapshot.graceUntilLabel}.
            </strong>{' '}
            <span className="text-amber-700">
              Renueva tu plan antes del vencimiento para evitar interrupciones.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Renovar ahora <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.isExpired) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-rose-200 bg-rose-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="alert"
        id="subscription-expired-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle size={16} className="text-rose-600 shrink-0" />
          <p className="text-xs text-rose-900">
            <strong className="font-bold">
              {snapshot.hasSubscription
                ? 'Suscripción vencida · Modo solo lectura.'
                : 'Sin suscripción activa · Modo solo lectura.'}
            </strong>{' '}
            <span className="text-rose-700">
              Puedes consultar historial y métricas; crear pedidos y asignar motorizados están bloqueados.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          {snapshot.hasSubscription ? 'Renovar suscripción' : 'Elegir plan'}{' '}
          <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.quotaReached) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-red-200 bg-red-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="alert"
        id="order-quota-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <p className="text-xs text-red-900">
            <strong className="font-bold">Cuota mensual alcanzada.</strong>{' '}
            <span className="text-red-700">
              No se pueden crear nuevos pedidos hasta ampliar el plan o iniciar un nuevo ciclo.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Ampliar plan <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.quotaState === 'warning') {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-amber-200 bg-amber-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="status"
        id="order-quota-warning-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Info size={16} className="text-amber-600 shrink-0" />
          <p className="text-xs text-amber-900">
            <strong className="font-bold">
              Has consumido el {Math.round(snapshot.usagePercent)}% de tu cuota mensual.
            </strong>{' '}
            <span className="text-amber-700">Considera subir de plan para evitar pausas.</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Ver planes <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.isTrial && snapshot.daysRemaining <= 5) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-sky-200 bg-sky-50/90 px-4 sm:px-6 py-2.5 shrink-0"
        role="status"
        id="trial-ending-banner"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock size={16} className="text-sky-600 shrink-0" />
          <p className="text-xs text-sky-900">
            <strong className="font-bold">
              Tu prueba gratuita termina en {snapshot.daysRemaining} día
              {snapshot.daysRemaining === 1 ? '' : 's'}.
            </strong>{' '}
            <span className="text-sky-700">Elige un plan para continuar sin interrupciones.</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          Elegir plan <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  return null;
}
