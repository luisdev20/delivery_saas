'use client';

import {
  BarChart2,
  Users,
  TrendingUp,
  Receipt,
  Settings,
  LogOut,
  Store,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import type { Restaurant } from '@/lib/supabase/types';
import type { SubscriptionSnapshot } from '@/lib/subscription';
import PlanBadge from './PlanBadge';

export type AdminTab = 'dashboard' | 'fleet' | 'metrics' | 'billing' | 'settings';

interface NavGroup {
  label: string;
  items: {
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    alertDot?: 'rose' | 'amber';
  }[];
}

interface Props {
  restaurant: Restaurant;
  adminTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  activeOrdersCount: number;
  activeDriverCount: number;
  snapshot: SubscriptionSnapshot;
  userEmail?: string | null;
  userRole: string;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function AdminSidebar({
  restaurant,
  adminTab,
  onSelectTab,
  activeOrdersCount,
  activeDriverCount,
  snapshot,
  userEmail,
  userRole,
  onLogout,
  mobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapse,
}: Props) {
  const billingAlert: 'rose' | 'amber' | undefined =
    snapshot.isSuspended || snapshot.isExpired || snapshot.quotaReached
      ? 'rose'
      : snapshot.isGrace || snapshot.quotaState === 'warning' || (snapshot.isTrial && snapshot.daysRemaining <= 5)
        ? 'amber'
        : undefined;

  const navGroups: NavGroup[] = [
    {
      label: 'Operación',
      items: [
        {
          id: 'dashboard',
          label: 'Monitor de Despachos',
          icon: <BarChart2 size={18} />,
          badge: activeOrdersCount,
        },
        {
          id: 'fleet',
          label: 'Personal Operativo',
          icon: <Users size={18} />,
          badge: activeDriverCount,
        },
        {
          id: 'metrics',
          label: 'Métricas',
          icon: <TrendingUp size={18} />,
        },
      ],
    },
    {
      label: 'Negocio',
      items: [
        {
          id: 'billing',
          label: 'Suscripción y Facturación',
          icon: <Receipt size={18} />,
          alertDot: billingAlert,
        },
        {
          id: 'settings',
          label: 'Configuración',
          icon: <Settings size={18} />,
        },
      ],
    },
  ];

  const handleSelect = (tab: AdminTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col bg-[#1E1B4B] text-white border-r border-white/[0.08]
          transition-all duration-200 ease-out select-none
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-[72px]' : 'w-[248px]'}
        `}
      >
        {/* Header del Comercio + Botón Colapsar */}
        <div className={`h-16 flex items-center border-b border-white/[0.08] shrink-0 ${collapsed ? 'px-3 justify-center' : 'px-4 justify-between gap-2'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ring-1 ring-white/15"
                style={{ backgroundColor: restaurant.brand_color || '#4F46E5' }}
              >
                <Store size={16} color="white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-[13px] text-white tracking-tight truncate leading-tight" title={restaurant.name}>
                  {restaurant.name}
                </h1>
                <p className="text-[11px] text-indigo-300/80 truncate leading-tight mt-0.5">
                  Consola de Despacho
                </p>
              </div>
            </div>
          )}

          {/* Toggle desktop */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-indigo-300/80 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
            aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>

          {/* Cerrar en móvil */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-indigo-300 hover:text-white hover:bg-white/10"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navegación agrupada */}
        <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${collapsed ? 'px-2.5' : 'px-3'}`}>
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-300/50">
                  {group.label}
                </p>
              ) : (
                <div className="mx-2 my-1 border-t border-white/[0.06] first:hidden" />
              )}

              {group.items.map((item) => {
                const isActive = adminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`tab-btn-${item.id}`}
                    onClick={() => handleSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`relative w-full flex items-center rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
                      collapsed ? 'justify-center h-10 px-0' : 'gap-2.5 px-3 py-2.5'
                    } ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-indigo-200/85 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>

                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-white/[0.08] text-indigo-200'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                        {item.alertDot && (
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              item.alertDot === 'rose' ? 'bg-rose-400' : 'bg-amber-400'
                            }`}
                          />
                        )}
                      </>
                    )}

                    {collapsed && item.alertDot && (
                      <span
                        className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                          item.alertDot === 'rose' ? 'bg-rose-400' : 'bg-amber-400'
                        }`}
                      />
                    )}
                    {collapsed && !item.alertDot && item.badge != null && item.badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer compacto: Plan + Perfil/Logout unificado */}
        <div className={`border-t border-white/[0.08] space-y-2.5 shrink-0 ${collapsed ? 'p-2.5' : 'p-3'}`}>
          <PlanBadge
            snapshot={snapshot}
            onOpenBilling={() => handleSelect('billing')}
            collapsed={collapsed}
          />

          <div
            className={`flex items-center rounded-xl bg-white/[0.04] border border-white/[0.06] ${
              collapsed ? 'flex-col gap-1.5 p-1.5' : 'justify-between gap-2 px-2.5 py-2'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
              <div
                className="w-7 h-7 rounded-full bg-indigo-500/30 border border-indigo-300/25 flex items-center justify-center text-[11px] font-bold text-indigo-100 shrink-0"
                title={userEmail || 'Usuario del comercio'}
              >
                {(userEmail || restaurant.name).charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate leading-tight" title={userEmail || undefined}>
                    {userEmail || 'Usuario del comercio'}
                  </p>
                  <p className="text-[10px] text-indigo-300/75 capitalize leading-tight mt-0.5">
                    {userRole === 'owner' ? 'Propietario' : userRole}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-indigo-300/80 hover:text-rose-300 hover:bg-rose-500/15 transition-colors shrink-0 cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px] z-20 md:hidden"
          onClick={onCloseMobile}
        />
      )}
    </>
  );
}
