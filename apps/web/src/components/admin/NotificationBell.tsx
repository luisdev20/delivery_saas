'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Bell, AlertTriangle, Info, Clock, CheckCheck, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { TenantNotification } from '@/lib/supabase/types';

interface Props {
  tenantId: string;
  onOpenBilling: () => void;
}

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  return `Hace ${Math.floor(diffHours / 24)}d`;
}

export default function NotificationBell({ tenantId, onOpenBilling }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [tableReady, setTableReady] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('tenant_notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      // Degrada sin romper UI si la migración 013 aún no se ejecuta en Supabase
      setTableReady(false);
      return;
    }

    setTableReady(true);
    setNotifications((data ?? []) as TenantNotification[]);
  }, [supabase, tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();
  }, [loadNotifications]);

  // Realtime WebSocket para recibir avisos del Superadmin al instante
  useEffect(() => {
    if (!tableReady) return;

    const channel = supabase
      .channel(`tenant-notifications-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tenant_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const item = payload.new as TenantNotification;
          setNotifications((prev) => [item, ...prev.filter((n) => n.id !== item.id)].slice(0, 25));
          if (item.severity === 'URGENT') {
            toast.error(`${item.title}: ${item.message}`, { duration: 9000 });
          } else if (item.severity === 'WARNING') {
            toast.warning(`${item.title}: ${item.message}`, { duration: 8000 });
          } else {
            toast.info(`${item.title}: ${item.message}`, { duration: 7000 });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenant_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const updated = payload.new as TenantNotification;
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, tableReady]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from('tenant_notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from('tenant_notifications').update({ is_read: true }).in('id', unreadIds);
  };

  const iconFor = (n: TenantNotification) => {
    if (n.severity === 'URGENT') return <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-0.5" />;
    if (n.severity === 'WARNING') return <Clock size={15} className="text-amber-600 shrink-0 mt-0.5" />;
    return <Info size={15} className="text-indigo-600 shrink-0 mt-0.5" />;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Notificaciones de plataforma"
        aria-label="Notificaciones de plataforma"
        className="relative w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-40 overflow-hidden animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Avisos de Plataforma
              </h3>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                <CheckCheck size={13} />
                Marcar leídas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <Bell size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">Sin notificaciones recientes</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Aquí verás recordatorios de suscripción y avisos de soporte en tiempo real.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const isBillingRelated = [
                  'SUBSCRIPTION_EXPIRING',
                  'SUBSCRIPTION_EXPIRED',
                  'GRACE_GRANTED',
                ].includes(n.type);

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markAsRead(n.id);
                    }}
                    className={`px-4 py-3 transition-colors cursor-pointer ${
                      n.is_read ? 'bg-white hover:bg-slate-50/60' : 'bg-indigo-50/40 hover:bg-indigo-50/70'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {iconFor(n)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{n.title}</p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {relativeTime(n.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                        {isBillingRelated && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!n.is_read) markAsRead(n.id);
                              setOpen(false);
                              onOpenBilling();
                            }}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            Ir a Suscripción <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-1.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
