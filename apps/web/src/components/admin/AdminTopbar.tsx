'use client';

import { Menu, PlusCircle, Loader2, Lock } from 'lucide-react';
import type { Restaurant } from '@/lib/supabase/types';
import type { SubscriptionSnapshot } from '@/lib/subscription';
import type { AdminTab } from './AdminSidebar';
import NotificationBell from './NotificationBell';

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Monitor de Despachos',
    subtitle: 'Pedidos, motorizados y entregas en tiempo real',
  },
  fleet: {
    title: 'Personal Operativo',
    subtitle: 'Flota de repartidores y accesos de estación KDS',
  },
  metrics: {
    title: 'Métricas de Rendimiento',
    subtitle: 'Indicadores operativos y desempeño por repartidor',
  },
  billing: {
    title: 'Suscripción y Facturación',
    subtitle: 'Plan contratado, consumo del ciclo e historial de pagos',
  },
  settings: {
    title: 'Configuración del Negocio',
    subtitle: 'Perfil comercial, cobertura y claves de integración B2B',
  },
};

interface Props {
  restaurant: Restaurant;
  adminTab: AdminTab;
  snapshot: SubscriptionSnapshot;
  canCreateOrders: boolean;
  togglingOpen: boolean;
  onToggleStoreStatus: () => void;
  onOpenMobileSidebar: () => void;
  onOpenManualModal: () => void;
  onOpenBilling: () => void;
}

export default function AdminTopbar({
  restaurant,
  adminTab,
  snapshot,
  canCreateOrders,
  togglingOpen,
  onToggleStoreStatus,
  onOpenMobileSidebar,
  onOpenManualModal,
  onOpenBilling,
}: Props) {
  const meta = TAB_TITLES[adminTab];
  const isOpen = restaurant.is_open !== false;
  const readOnly = snapshot.readOnly;

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-10">
      {/* Izquierda: menú móvil + título de sección */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shrink-0"
          aria-label="Abrir navegación"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
              {meta.title}
            </h2>
            <span className="hidden lg:inline-block text-slate-300">/</span>
            <span className="hidden lg:inline-block text-xs font-medium text-slate-500 truncate">
              {restaurant.name}
            </span>
          </div>
          <p className="hidden sm:block text-[11px] text-slate-500 truncate">
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* Derecha: Estado de recepción + Campana Realtime + CTA contextual */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        {readOnly ? (
          <button
            type="button"
            onClick={onOpenBilling}
            title={
              snapshot.isSuspended
                ? 'Cuenta suspendida por administración'
                : 'Suscripción vencida: haz clic para renovar'
            }
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/80 transition-colors cursor-pointer"
          >
            <Lock size={13} />
            <span className="hidden sm:inline">
              {snapshot.isSuspended ? 'Cuenta suspendida' : 'Solo lectura'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            id="btn-toggle-store"
            onClick={onToggleStoreStatus}
            disabled={togglingOpen}
            title={isOpen ? 'Haz clic para pausar la recepción de pedidos' : 'Haz clic para reanudar despachos'}
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-60 ${
              isOpen
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100/70'
                : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80'
            }`}
          >
            {togglingOpen ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <span
                className={`w-2 h-2 rounded-full ${
                  isOpen ? 'bg-emerald-500 pulse-dot' : 'bg-amber-500'
                }`}
              />
            )}
            <span className="hidden sm:inline">
              {isOpen ? 'Recibiendo pedidos' : 'Despachos pausados'}
            </span>
            <span className="sm:hidden">{isOpen ? 'Abierto' : 'Pausado'}</span>
          </button>
        )}

        <NotificationBell tenantId={restaurant.id} onOpenBilling={onOpenBilling} />

        {adminTab === 'dashboard' && (
          <button
            type="button"
            id="btn-new-manual-dispatch"
            onClick={onOpenManualModal}
            disabled={!canCreateOrders}
            title={
              readOnly
                ? snapshot.isSuspended
                  ? 'Cuenta suspendida por administración'
                  : 'Suscripción vencida: renueva tu plan para crear despachos'
                : snapshot.quotaReached
                  ? 'Límite de pedidos alcanzado para el ciclo actual'
                  : 'Registrar un despacho manual'
            }
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <PlusCircle size={15} />
            <span className="hidden sm:inline">Nuevo Despacho</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        )}
      </div>
    </header>
  );
}
