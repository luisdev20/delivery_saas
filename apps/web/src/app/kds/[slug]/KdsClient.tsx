'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ChefHat, Bell, CheckCircle2, Clock, Volume2, VolumeX,
  Maximize2, Minimize2, Flame, PackageCheck, AlertCircle,
  Check, RefreshCw, Sparkles
} from 'lucide-react';
import type { Restaurant, Order, OrderStatus } from '@/lib/supabase/types';

interface Props {
  restaurant: Restaurant;
  initialOrders: Order[];
}

function playKitchenChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
    osc1.frequency.setValueAtTime(783.99, now + 0.24); // G5
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);
  } catch (_) {}
}

function formatElapsedMinutes(createdAt: string): { text: string; minutes: number } {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return {
    text: `${mins}m ${secs < 10 ? '0' : ''}${secs}s`,
    minutes: mins,
  };
}

export default function KdsClient({ restaurant, initialOrders }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'nuevos' | 'prep' | 'listos'>('nuevos');
  const [, setTimerTick] = useState(0);
  const [currentTime, setCurrentTime] = useState('');
  const supabase = createClient();

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update elapsed timers every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load latest orders
  const refreshOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurant.id)
      .in('status', ['RECIBIDO', 'EN_PREPARACION', 'LISTO'])
      .order('created_at', { ascending: true });
    if (data) setOrders(data as Order[]);
  }, [restaurant.id, supabase]);

  // Realtime Supabase Subscription for kitchen orders
  useEffect(() => {
    const channel = supabase
      .channel(`kds-${restaurant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: newOrder } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', payload.new.id)
            .single();

          if (newOrder) {
            setOrders(prev => [newOrder as Order, ...prev]);
            if (soundEnabled) playKitchenChime();
            toast.info(`🔔 ¡Nueva comanda #${newOrder.order_number}!`);
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Order;
          if (['ENTREGADO', 'CANCELADO'].includes(updated.status)) {
            setOrders(prev => prev.filter(o => o.id !== updated.id));
          } else {
            setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
          }
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurant.id, soundEnabled, supabase]);

  // Advance order status (RECIBIDO -> EN_PREPARACION -> LISTO)
  const advanceStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));
      if (nextStatus === 'LISTO') {
        toast.success(`Comanda marcada como LISTA para entrega`);
      } else if (nextStatus === 'EN_PREPARACION') {
        toast.success(`Comanda en preparación`);
      }
    } catch {
      toast.error('Error al actualizar el estado de la orden');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const toggleItemCheck = (itemId: string) => {
    setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const kdsNuevos = useMemo(() => orders.filter(o => o.status === 'RECIBIDO'), [orders]);
  const kdsPrep = useMemo(() => orders.filter(o => o.status === 'EN_PREPARACION'), [orders]);
  const kdsListos = useMemo(() => orders.filter(o => o.status === 'LISTO'), [orders]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 text-slate-900 select-none overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ===== KDS HEADER ===== */}
      <header className="flex-shrink-0 bg-indigo-950 text-white border-b border-indigo-800/80 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <ChefHat size={18} className="sm:hidden" />
            <ChefHat size={22} className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-base font-extrabold text-white tracking-wide uppercase truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                KDS &middot; {restaurant.name}
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                En Vivo
              </span>
            </div>
            <p className="hidden sm:block text-xs text-indigo-300 font-medium truncate">
              Pantalla de Operaciones y Cocina
            </p>
          </div>
        </div>

        {/* Middle Stats Badges (Desktop only) */}
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="px-3 py-1 rounded-lg bg-indigo-900/90 border border-indigo-700/80 flex items-center gap-2 text-xs font-semibold text-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Nuevos: <span className="text-white font-bold">{kdsNuevos.length}</span>
          </div>
          <div className="px-3 py-1 rounded-lg bg-indigo-900/90 border border-indigo-700/80 flex items-center gap-2 text-xs font-semibold text-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Cocinando: <span className="text-white font-bold">{kdsPrep.length}</span>
          </div>
          <div className="px-3 py-1 rounded-lg bg-indigo-900/90 border border-indigo-700/80 flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Listos: <span className="text-white font-bold">{kdsListos.length}</span>
          </div>
        </div>

        {/* Right Actions: Clock, Sound, Refresh, Fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-indigo-900/80 border border-indigo-700/80 text-xs font-mono font-bold text-indigo-200">
            <Clock size={13} className="text-amber-400" />
            {currentTime || '--:--:--'}
          </div>

          <button
            onClick={() => setSoundEnabled(s => !s)}
            className={`p-1.5 sm:p-2 rounded-lg border transition-colors ${
              soundEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-indigo-900/60 text-indigo-400 border-indigo-800 hover:text-white'
            }`}
            title={soundEnabled ? 'Alerta sonora activada' : 'Alerta sonora silenciada'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          <button
            onClick={refreshOrders}
            className="p-1.5 sm:p-2 rounded-lg bg-indigo-900/80 text-indigo-200 border border-indigo-700/80 hover:bg-indigo-800 hover:text-white transition-colors"
            title="Recargar comandas"
          >
            <RefreshCw size={15} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 rounded-lg bg-indigo-900/80 text-indigo-200 border border-indigo-700/80 hover:bg-indigo-800 hover:text-white transition-colors"
            title="Pantalla completa"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ===== MOBILE SEGMENTED TABS (Solo para celular vertical / < sm) ===== */}
      <div className="sm:hidden flex items-center p-1.5 bg-indigo-950 border-b border-indigo-800/80 gap-1.5 shrink-0 z-10">
        <button
          onClick={() => setMobileTab('nuevos')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'nuevos'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-indigo-200 hover:bg-indigo-900/60'
          }`}
        >
          <span>1. Nuevos</span>
          <span className="bg-white/20 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
            {kdsNuevos.length}
          </span>
        </button>

        <button
          onClick={() => setMobileTab('prep')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'prep'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-indigo-200 hover:bg-indigo-900/60'
          }`}
        >
          <span>2. Cocinando</span>
          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
            mobileTab === 'prep' ? 'bg-slate-950/20 text-slate-950' : 'bg-white/20 text-white'
          }`}>
            {kdsPrep.length}
          </span>
        </button>

        <button
          onClick={() => setMobileTab('listos')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'listos'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-indigo-200 hover:bg-indigo-900/60'
          }`}
        >
          <span>3. Listos</span>
          <span className="bg-white/20 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
            {kdsListos.length}
          </span>
        </button>
      </div>

      {/* ===== KANBAN LANES (Responsive Multi-device Layout) ===== */}
      <main className="flex-1 min-h-0 p-2 sm:p-4 lg:p-6 bg-[#F1F5F9] overflow-hidden">
        <div className="h-full w-full sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:grid-rows-2 lg:grid-rows-1 gap-2.5 sm:gap-4 lg:gap-6 min-h-0">

          {/* COLUMN 1: NUEVOS (RECIBIDO) */}
          <section className={`
            flex-col rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden h-full min-h-0 min-w-0 sm:col-span-1 lg:col-span-1 sm:row-span-1
            ${mobileTab === 'nuevos' ? 'flex' : 'hidden sm:flex'}
          `}>
            <div className="p-2 sm:p-3.5 bg-blue-50/80 border-b border-blue-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                  <Bell size={12} className={kdsNuevos.length > 0 ? 'animate-bounce' : ''} />
                </div>
                <h2 className="font-extrabold text-[10px] sm:text-xs text-blue-900 uppercase tracking-wider truncate">
                  1. Nuevos &middot; Por Preparar
                </h2>
              </div>
              <span className="bg-blue-600 text-white font-black text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shadow-xs shrink-0">
                {kdsNuevos.length}
              </span>
            </div>

            <div className="flex-1 p-2 sm:p-3 lg:p-4 overflow-y-auto space-y-2.5 sm:space-y-3.5 bg-slate-50/40 min-h-0">
              {kdsNuevos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-400">
                  <CheckCircle2 size={28} className="mb-1 text-slate-300 sm:w-8 sm:h-8" />
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600">Sin comandas pendientes</p>
                  <p className="text-[10px] text-slate-400">Los nuevos pedidos aparecerán aquí</p>
                </div>
              ) : (
                kdsNuevos.map(order => {
                  const elapsed = formatElapsedMinutes(order.created_at);
                  const isUrgent = elapsed.minutes >= 15;
                  return (
                    <div
                      key={order.id}
                      className={`rounded-lg sm:rounded-xl border-2 p-2.5 sm:p-3.5 shadow-sm bg-white transition-all ${
                        isUrgent
                          ? 'border-red-400 bg-red-50/30 ring-2 ring-red-300 animate-pulse'
                          : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'
                      }`}
                    >
                      {/* Ticket Header */}
                      <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-slate-100">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                              #{order.order_number}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {order.payment_method}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">
                            {order.customer_name}
                          </p>
                        </div>

                        {/* Timer Badge */}
                        <div className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 ${
                          isUrgent
                            ? 'bg-red-600 text-white'
                            : elapsed.minutes >= 8
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          <Clock size={10} />
                          {elapsed.text}
                        </div>
                      </div>

                      {/* Order Notes */}
                      {order.notes && (
                        <div className="mb-2 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-medium flex items-start gap-1.5">
                          <AlertCircle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="uppercase text-[8px] font-bold text-amber-800 block">Nota:</span>
                            {order.notes}
                          </div>
                        </div>
                      )}

                      {/* Dish Items Checklist */}
                      <div className="space-y-1 mb-2.5">
                        {order.order_items?.map(item => {
                          const isChecked = !!checkedItems[item.id];
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleItemCheck(item.id)}
                              className={`p-1.5 rounded flex items-center justify-between gap-1.5 cursor-pointer transition-colors border ${
                                isChecked
                                  ? 'bg-slate-100 border-slate-200 opacity-50 line-through text-slate-400'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0">
                                  {item.quantity}
                                </span>
                                <span className="font-bold text-[11px] sm:text-xs leading-tight truncate">
                                  {item.product_name}
                                </span>
                              </div>
                              <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border flex items-center justify-center shrink-0 ${
                                isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                              }`}>
                                {isChecked && <Check size={10} strokeWidth={3} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => advanceStatus(order.id, 'EN_PREPARACION')}
                        disabled={updatingId === order.id}
                        className="w-full py-1.5 sm:py-2 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        <Flame size={12} />
                        <span className="truncate">{updatingId === order.id ? '...' : 'Comenzar Preparación'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* COLUMN 2: EN PREPARACIÓN (COCINANDO) */}
          <section className={`
            flex-col rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden h-full min-h-0 min-w-0 sm:col-span-1 lg:col-span-1 sm:row-span-1
            ${mobileTab === 'prep' ? 'flex' : 'hidden sm:flex'}
          `}>
            <div className="p-2 sm:p-3.5 bg-amber-50/80 border-b border-amber-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                  <Flame size={12} className="animate-pulse" />
                </div>
                <h2 className="font-extrabold text-[10px] sm:text-xs text-amber-900 uppercase tracking-wider truncate">
                  2. En Preparación &middot; Cocinando
                </h2>
              </div>
              <span className="bg-amber-500 text-slate-950 font-black text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shadow-xs shrink-0">
                {kdsPrep.length}
              </span>
            </div>

            <div className="flex-1 p-2 sm:p-3 lg:p-4 overflow-y-auto space-y-2.5 sm:space-y-3.5 bg-slate-50/40 min-h-0">
              {kdsPrep.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-400">
                  <Flame size={28} className="mb-1 text-slate-300 sm:w-8 sm:h-8" />
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600">Ningún plato en cocina</p>
                  <p className="text-[10px] text-slate-400">Presiona 'Comenzar Preparación' en la etapa 1</p>
                </div>
              ) : (
                kdsPrep.map(order => {
                  const elapsed = formatElapsedMinutes(order.created_at);
                  const isUrgent = elapsed.minutes >= 20;
                  return (
                    <div
                      key={order.id}
                      className={`rounded-lg sm:rounded-xl border-2 p-2.5 sm:p-3.5 shadow-sm bg-white transition-all ${
                        isUrgent
                          ? 'border-red-400 bg-red-50/30 ring-2 ring-red-300 animate-pulse'
                          : 'border-amber-300 bg-white hover:border-amber-400 hover:shadow-md'
                      }`}
                    >
                      {/* Ticket Header */}
                      <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-slate-100">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                              #{order.order_number}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Cocinando
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">
                            {order.customer_name}
                          </p>
                        </div>

                        {/* Timer Badge */}
                        <div className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 ${
                          isUrgent
                            ? 'bg-red-600 text-white'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          <Clock size={10} />
                          {elapsed.text}
                        </div>
                      </div>

                      {/* Order Notes */}
                      {order.notes && (
                        <div className="mb-2 p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-medium flex items-start gap-1.5">
                          <AlertCircle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="uppercase text-[8px] font-bold text-amber-800 block">Nota:</span>
                            {order.notes}
                          </div>
                        </div>
                      )}

                      {/* Dish Items Checklist */}
                      <div className="space-y-1 mb-2.5">
                        {order.order_items?.map(item => {
                          const isChecked = !!checkedItems[item.id];
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleItemCheck(item.id)}
                              className={`p-1.5 rounded flex items-center justify-between gap-1.5 cursor-pointer transition-colors border ${
                                isChecked
                                  ? 'bg-slate-100 border-slate-200 opacity-50 line-through text-slate-400'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 h-4 sm:w-5 sm:h-5 rounded bg-amber-100 border border-amber-300 text-amber-800 font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0">
                                  {item.quantity}
                                </span>
                                <span className="font-bold text-[11px] sm:text-xs leading-tight truncate">
                                  {item.product_name}
                                </span>
                              </div>
                              <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border flex items-center justify-center shrink-0 ${
                                isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                              }`}>
                                {isChecked && <Check size={10} strokeWidth={3} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => advanceStatus(order.id, 'LISTO')}
                        disabled={updatingId === order.id}
                        className="w-full py-1.5 sm:py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        <PackageCheck size={12} />
                        <span className="truncate">{updatingId === order.id ? '...' : 'Listo para Empaque'}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* COLUMN 3: LISTOS (BOLSA DE ENTREGA) */}
          <section className={`
            flex-col rounded-xl sm:rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden h-full min-h-0 min-w-0 sm:col-span-2 lg:col-span-1 sm:row-span-1
            ${mobileTab === 'listos' ? 'flex' : 'hidden sm:flex'}
          `}>
            <div className="p-2 sm:p-3.5 bg-emerald-50/80 border-b border-emerald-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                  <PackageCheck size={12} />
                </div>
                <h2 className="font-extrabold text-[10px] sm:text-xs text-emerald-900 uppercase tracking-wider truncate">
                  3. Listos &middot; Para Repartidor
                </h2>
              </div>
              <span className="bg-emerald-600 text-white font-black text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shadow-xs shrink-0">
                {kdsListos.length}
              </span>
            </div>

            <div className="flex-1 p-2 sm:p-3 lg:p-4 overflow-y-auto space-y-2.5 sm:space-y-3.5 bg-slate-50/40 min-h-0">
              {kdsListos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-400">
                  <PackageCheck size={28} className="mb-1 text-slate-300 sm:w-8 sm:h-8" />
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600">Sin pedidos listos</p>
                  <p className="text-[10px] text-slate-400">Aparecerán aquí cuando estén listos para despacho</p>
                </div>
              ) : (
                kdsListos.map(order => {
                  const elapsed = formatElapsedMinutes(order.created_at);
                  return (
                    <div
                      key={order.id}
                      className="rounded-lg sm:rounded-xl border-2 border-emerald-300 bg-white p-2.5 sm:p-3.5 shadow-sm hover:shadow-md transition-all"
                    >
                      {/* Ticket Header */}
                      <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-slate-100">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                              #{order.order_number}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Listo
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">
                            {order.customer_name}
                          </p>
                        </div>

                        {/* Timer Badge */}
                        <div className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                          <Clock size={10} />
                          {elapsed.text}
                        </div>
                      </div>

                      {/* Dish Items */}
                      <div className="space-y-1 mb-2.5">
                        {order.order_items?.map(item => (
                          <div
                            key={item.id}
                            className="p-1 rounded bg-slate-50 border border-slate-100 flex items-center gap-1.5 text-slate-700"
                          >
                            <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[9px]">
                              {item.quantity}
                            </span>
                            <span className="font-semibold text-[10px] sm:text-[11px] truncate">{item.product_name}</span>
                          </div>
                        ))}
                      </div>

                      <div className="p-1.5 rounded bg-emerald-50 border border-emerald-200 text-center">
                        <span className="text-[10px] font-bold text-emerald-800 flex items-center justify-center gap-1">
                          <Sparkles size={11} className="text-emerald-600 shrink-0" />
                          <span className="truncate">Esperando recogida</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
