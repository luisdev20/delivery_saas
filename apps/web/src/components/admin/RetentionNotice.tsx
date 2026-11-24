'use client';

import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import type { RetentionInfo } from '@/lib/retention';

interface Props {
  info: RetentionInfo;
  onOpenBilling: () => void;
}

/**
 * Aviso previo de eliminación definitiva.
 *
 * Aparece cuando el plazo de retención entra en su ventana de aviso y
 * permanece visible en todas las vistas del panel hasta que el
 * comercio reactiva el servicio.
 */
export default function RetentionNotice({ info, onOpenBilling }: Props) {
  if (!info.isScheduledForDeletion) return null;

  const critical = info.stage !== 'NOTICE';
  const palette = critical
    ? {
        wrapper: 'border-rose-300 bg-rose-100/80',
        icon: 'text-rose-700',
        title: 'text-rose-950',
        body: 'text-rose-800',
        button: 'bg-rose-700 hover:bg-rose-800',
      }
    : {
        wrapper: 'border-orange-200 bg-orange-50',
        icon: 'text-orange-600',
        title: 'text-orange-950',
        body: 'text-orange-800',
        button: 'bg-orange-600 hover:bg-orange-700',
      };

  const Icon = critical ? AlertTriangle : Clock;

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b px-4 sm:px-6 py-3 ${palette.wrapper}`}
      role="alert"
      id="retention-notice-banner"
    >
      <div className="flex items-start gap-2.5">
        <Icon size={18} className={`shrink-0 mt-0.5 ${palette.icon}`} />
        <div>
          <p className={`text-xs sm:text-sm font-bold ${palette.title}`}>{info.headline}</p>
          <p className={`text-[11px] sm:text-xs mt-0.5 ${palette.body}`}>{info.detail}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenBilling}
        className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white transition-colors ${palette.button}`}
      >
        Reactivar servicio <ArrowRight size={13} />
      </button>
    </div>
  );
}
