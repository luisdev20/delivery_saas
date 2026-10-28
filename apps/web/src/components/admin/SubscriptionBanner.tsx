'use client';

import { AlertTriangle, ArrowRight, Clock, Info } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface Props {
  snapshot: SubscriptionSnapshot;
  onOpenBilling: () => void;
}

export default function SubscriptionBanner({ snapshot, onOpenBilling }: Props) {
  if (snapshot.isExpired) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 sm:px-6 py-3"
        role="alert"
        id="subscription-expired-banner"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs sm:text-sm font-bold text-rose-900">
              {snapshot.hasSubscription
                ? 'Suscripción vencida · Panel en modo solo lectura'
                : 'Sin suscripción activa · Panel en modo solo lectura'}
            </p>
            <p className="text-[11px] sm:text-xs text-rose-700 mt-0.5">
              Puedes consultar historial, despachos y métricas. La creación de pedidos y la
              asignación de motorizados están bloqueadas hasta activar un plan.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-bold text-white transition-colors"
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
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 sm:px-6 py-3"
        role="alert"
        id="order-quota-banner"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs sm:text-sm font-bold text-red-900">
              Límite de pedidos alcanzado para el ciclo actual
            </p>
            <p className="text-[11px] sm:text-xs text-red-700 mt-0.5">
              No se pueden crear nuevos pedidos (manuales ni vía API). Los pedidos en curso pueden
              finalizarse con normalidad.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 px-3.5 py-2 text-xs font-bold text-white transition-colors"
        >
          Ampliar plan <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.quotaState === 'warning') {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 sm:px-6 py-3"
        role="status"
        id="order-quota-warning-banner"
      >
        <div className="flex items-start gap-2.5">
          <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs sm:text-sm font-bold text-amber-900">
              Estás al {Math.round(snapshot.usagePercent)}% de tu cuota mensual
            </p>
            <p className="text-[11px] sm:text-xs text-amber-700 mt-0.5">
              Considera subir de plan para evitar pausas en el servicio.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 px-3.5 py-2 text-xs font-bold text-white transition-colors"
        >
          Ver planes <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (snapshot.isTrial && snapshot.daysRemaining <= 5) {
    return (
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 sm:px-6 py-3"
        role="status"
        id="trial-ending-banner"
      >
        <div className="flex items-start gap-2.5">
          <Clock size={18} className="text-sky-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs sm:text-sm font-bold text-sky-900">
              Tu prueba gratuita termina en {snapshot.daysRemaining} día
              {snapshot.daysRemaining === 1 ? '' : 's'}
            </p>
            <p className="text-[11px] sm:text-xs text-sky-700 mt-0.5">
              Elige un plan para mantener el acceso completo y evitar el modo solo lectura.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenBilling}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-3.5 py-2 text-xs font-bold text-white transition-colors"
        >
          Elegir plan <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  return null;
}
