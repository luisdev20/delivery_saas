'use client';

import {
  LayoutDashboard,
  BarChart3,
  Store,
  CreditCard,
  Bell,
  LogOut,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';

export type SuperAdminTab = 'overview' | 'metrics' | 'merchants' | 'subscriptions' | 'notifications';

interface SuperAdminNavGroup {
  label: string;
  items: {
    id: SuperAdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    badgeTone?: 'rose';
  }[];
}

interface Props {
  activeTab: SuperAdminTab;
  onSelectTab: (tab: SuperAdminTab) => void;
  totalMerchants: number;
  atRiskCount: number;
  notificationsCount: number;
  userEmail?: string | null;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function SuperAdminSidebar({
  activeTab,
  onSelectTab,
  totalMerchants,
  atRiskCount,
  notificationsCount,
  userEmail,
  onLogout,
  mobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapse,
}: Props) {
  const navGroups: SuperAdminNavGroup[] = [
    {
      label: 'Plataforma',
      items: [
        {
          id: 'overview' as SuperAdminTab,
          label: 'Resumen',
          icon: <LayoutDashboard size={18} />,
        },
        {
          id: 'metrics' as SuperAdminTab,
          label: 'Métricas',
          icon: <BarChart3 size={18} />,
        },
        {
          id: 'merchants' as SuperAdminTab,
          label: 'Comercios',
          icon: <Store size={18} />,
          badge: totalMerchants,
        },
      ],
    },
    {
      label: 'Gobernanza',
      items: [
        {
          id: 'subscriptions' as SuperAdminTab,
          label: 'Suscripciones',
          icon: <CreditCard size={18} />,
          badge: atRiskCount > 0 ? atRiskCount : undefined,
          badgeTone: atRiskCount > 0 ? ('rose' as const) : undefined,
        },
        {
          id: 'notifications' as SuperAdminTab,
          label: 'Notificaciones',
          icon: <Bell size={18} />,
          badge: notificationsCount > 0 ? notificationsCount : undefined,
        },
      ],
    },
  ];

  const handleSelect = (tab: SuperAdminTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  return (
    <>
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col bg-slate-900 text-white border-r border-white/[0.08]
          transition-all duration-200 ease-out select-none
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-[72px]' : 'w-[248px]'}
        `}
      >
        {/* Header de Plataforma */}
        <div className={`h-16 flex items-center border-b border-white/[0.08] shrink-0 ${collapsed ? 'px-3 justify-center' : 'px-4 justify-between gap-2'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck size={17} />
              </div>
              <h1 className="font-bold text-sm text-white tracking-tight truncate">
                Delivery Tracker
              </h1>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navegación */}
        <nav className={`flex-1 overflow-y-auto py-4 space-y-5 ${collapsed ? 'px-2.5' : 'px-3'}`}>
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed ? (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {group.label}
                </p>
              ) : (
                <div className="mx-2 my-1 border-t border-white/[0.06] first:hidden" />
              )}

              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`relative w-full flex items-center rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
                      collapsed ? 'justify-center h-10 px-0' : 'gap-2.5 px-3 py-2.5'
                    } ${
                      isActive
                        ? 'bg-white/[0.12] text-white ring-1 ring-white/[0.12]'
                        : 'text-slate-300/85 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className={isActive ? 'text-emerald-400 shrink-0' : 'shrink-0'}>
                      {item.icon}
                    </span>

                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {item.badge != null && (
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${
                              item.badgeTone === 'rose'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-400/25'
                                : 'bg-white/[0.08] text-slate-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}

                    {collapsed && item.badgeTone === 'rose' && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer compacto: Perfil Superadmin + Logout */}
        <div className={`border-t border-white/[0.08] shrink-0 ${collapsed ? 'p-2.5' : 'p-3'}`}>
          <div
            className={`flex items-center rounded-xl bg-white/[0.04] border border-white/[0.06] ${
              collapsed ? 'flex-col gap-1.5 p-1.5' : 'justify-between gap-2 px-2.5 py-2'
            }`}
          >
            <div className={`flex items-center gap-2.5 min-w-0 ${collapsed ? 'justify-center' : ''}`}>
              <div
                className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-[11px] font-bold text-emerald-300 shrink-0"
                title={userEmail || 'Superadministrador'}
              >
                {(userEmail || 'S').charAt(0).toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate leading-tight" title={userEmail || undefined}>
                    {userEmail || 'superadmin@delivery.com'}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    Superadministrador
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors shrink-0 cursor-pointer"
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
