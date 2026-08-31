'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order, DriverLocation, Restaurant } from '@/lib/supabase/types';
import { MapPin, Package, Truck, CheckCircle, Clock, Phone, ShieldCheck, Bell } from 'lucide-react';

interface Props {
  order: Order;
  restaurant: Restaurant;
  initialDriverLocation: DriverLocation | null;
}

function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

function playNearbyChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.0, now + 0.15); // A5
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (_) {}
}

const STATUS_STEPS = [
  { key: 'RECIBIDO',           label: 'Recibido',     icon: <Package size={14} /> },
  { key: 'EN_PREPARACION',     label: 'Preparando',   icon: <Clock size={14} /> },
  { key: 'LISTO_PARA_ENTREGA', label: 'Listo',        icon: <CheckCircle size={14} /> },
  { key: 'ASIGNADO',           label: 'Asignado',     icon: <CheckCircle size={14} /> },
  { key: 'EN_CAMINO',          label: 'En camino',    icon: <Truck size={14} /> },
  { key: 'ENTREGADO',          label: 'Entregado',    icon: <CheckCircle size={14} /> },
];

export default function TrackingClient({ order, restaurant, initialDriverLocation }: Props) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [driverLocation, setDriverLocation] = useState(initialDriverLocation);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const driverMarkerRef = useRef<unknown>(null);
  const hasChimedRef = useRef(false);
  const supabase = createClient();

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === currentOrder.status);

  const distanceMeters = driverLocation
    ? calculateDistanceInMeters(
        driverLocation.current_lat,
        driverLocation.current_lng,
        currentOrder.delivery_lat,
        currentOrder.delivery_lng
      )
    : null;

  const isNearby = currentOrder.status === 'EN_CAMINO' && distanceMeters !== null && distanceMeters <= 350;

  useEffect(() => {
    if (isNearby && !hasChimedRef.current) {
      hasChimedRef.current = true;
      playNearbyChime();
    }
  }, [isNearby]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;
    let isMounted = true;

    import('leaflet').then(L => {
      if (!isMounted || !mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current!).setView([order.delivery_lat, order.delivery_lng], 14);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const destIcon = L.divIcon({
        html: `<div style="
          width:34px;height:34px;background:${restaurant.brand_color};
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.35);
        "></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        className: '',
      });

      L.marker([order.delivery_lat, order.delivery_lng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>${order.customer_name}</b><br>${order.delivery_address}`);

      leafletMapRef.current = map;
    });

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (leafletMapRef.current as any).remove();
        leafletMapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!driverLocation || !leafletMapRef.current) return;
    import('leaflet').then(L => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = leafletMapRef.current as any;
      if (!map) return;

      const distLabel = distanceMeters !== null
        ? distanceMeters < 1000
          ? `${distanceMeters} m`
          : `${(distanceMeters / 1000).toFixed(1)} km`
        : 'En ruta';

      const driverIcon = L.divIcon({
        html: `
          <div style="position:relative; width:48px; height:48px; display:flex; align-items:center; justify-content:center;">
            <div class="radar-wave"></div>
            <div style="
              width:44px; height:44px;
              background: linear-gradient(135deg, #4F46E5 0%, #312E81 100%);
              border-radius:50%;
              border:3px solid white;
              box-shadow: 0 4px 14px rgba(79, 70, 229, 0.5), 0 2px 6px rgba(0,0,0,0.3);
              display:flex; align-items:center; justify-content:center;
              position:relative; z-index:2;
            ">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18.5" cy="17.5" r="3.5"/>
                <circle cx="5.5" cy="17.5" r="3.5"/>
                <circle cx="15" cy="5" r="1"/>
                <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
              </svg>
            </div>
            <div style="
              position:absolute; bottom:-18px; left:50%; transform:translateX(-50%);
              background: #1E1B4B; color:white; font-size:10px; font-weight:800;
              padding:2px 7px; border-radius:12px; white-space:nowrap;
              border:1.5px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.25);
              z-index:3;
            ">
              🛵 ${distLabel}
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        className: '',
      });

      if (driverMarkerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (driverMarkerRef.current as any).setLatLng([driverLocation.current_lat, driverLocation.current_lng]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (driverMarkerRef.current as any).setIcon(driverIcon);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        driverMarkerRef.current = L.marker(
          [driverLocation.current_lat, driverLocation.current_lng],
          { icon: driverIcon }
        ).addTo(map);
      }

      try {
        map.fitBounds([
          [driverLocation.current_lat, driverLocation.current_lng],
          [currentOrder.delivery_lat, currentOrder.delivery_lng],
        ], { padding: [60, 60], maxZoom: 16 });
      } catch (_) {}
    });
  }, [driverLocation, currentOrder.delivery_lat, currentOrder.delivery_lng, distanceMeters]);

  // Subscribe to driver location updates (active only while NOT ENTREGADO)
  useEffect(() => {
    const driverId = currentOrder.driver_id;
    if (!driverId || currentOrder.status === 'ENTREGADO') {
      // If delivered, remove driver marker from map
      if (driverMarkerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (driverMarkerRef.current as any).remove();
        driverMarkerRef.current = null;
      }
      return;
    }

    // Fetch latest known driver location immediately
    supabase
      .from('driver_locations')
      .select('*')
      .eq('driver_id', driverId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDriverLocation(data as DriverLocation);
      });

    const channel = supabase
      .channel(`driver-loc-${driverId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `driver_id=eq.${driverId}`,
      }, payload => {
        if (payload.new) {
          setDriverLocation(payload.new as DriverLocation);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentOrder.driver_id, currentOrder.status, supabase]);

  // Subscribe to order status and assignment changes
  useEffect(() => {
    const channel = supabase
      .channel(`order-status-${order.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${order.id}`,
      }, payload => {
        if (payload.new) {
          const updated = payload.new as Partial<Order>;
          setCurrentOrder((prev: Order) => ({ ...prev, ...updated }));
          if (updated.status === 'ENTREGADO' && driverMarkerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (driverMarkerRef.current as any).remove();
            driverMarkerRef.current = null;
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [order.id, supabase]);

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header className="flex-shrink-0 px-5 py-5 shadow-md" style={{ background: restaurant.brand_color }}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-base">
            {restaurant.name[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-white font-bold text-sm leading-tight">{restaurant.name}</h1>
            <p className="text-white/70 text-xs">Seguimiento de pedido #{order.order_number}</p>
          </div>
          {currentOrder.status === 'EN_CAMINO' && (
            <div className="flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" />
              <span className="text-white text-xs font-medium">En camino</span>
            </div>
          )}
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" id="tracking-map" />

        {/* Proximity Alert Banner: Driver is nearby (< 350m) */}
        {isNearby && (
          <div className="absolute top-4 left-4 right-4 z-[400] max-w-lg mx-auto animate-fade-in pointer-events-auto">
            <div className="bg-emerald-700 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3.5 border-2 border-emerald-400">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                <Bell size={24} className="text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-sm text-white">¡Tu repartidor está muy cerca!</h4>
                  <span className="bg-white/25 text-[10px] px-2 py-0.5 rounded-full font-black">
                    {distanceMeters}m
                  </span>
                </div>
                <p className="text-xs text-emerald-100 mt-0.5 leading-snug">
                  Ve saliendo a tu puerta o recepción. Recuerda tener listo tu PIN: <span className="underline decoration-white font-mono font-black text-white">{currentOrder.order_number.toString().padStart(4, '0')}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {currentOrder.status === 'ENTREGADO' && (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 z-[500]"
            style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)' }}
          >
            <div className="bg-white p-7 text-center max-w-sm w-full rounded-2xl shadow-2xl animate-fade-in border border-slate-100">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500">
                <CheckCircle size={36} className="text-emerald-600" />
              </div>
              <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full inline-block mb-3">
                Entrega Confirmada
              </span>
              <h2 className="font-black text-2xl text-slate-900 mb-2">
                ¡Pedido Entregado!
              </h2>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Tu orden <strong className="text-slate-900 font-bold">#ORD-{order.order_number}</strong> de <strong className="text-slate-900 font-bold">{restaurant.name}</strong> ha sido entregada y validada correctamente con tu PIN. El seguimiento GPS ha finalizado.
              </p>
              <div>
                <a
                  href={`/p/${restaurant.slug}`}
                  className="btn btn-primary btn-full text-white font-bold py-3 text-sm shadow-md hover:opacity-95 transition-opacity"
                  style={{ background: restaurant.brand_color }}
                  id="btn-back-menu"
                >
                  Volver al Menú
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="flex-shrink-0 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.1)]" style={{ maxHeight: '44vh', overflowY: 'auto' }}>
        <div className="max-w-lg mx-auto px-5 pt-5 pb-6 space-y-5">

          {/* Progress stepper */}
          <div className="flex items-start justify-between gap-1">
            {STATUS_STEPS.map((step, i) => {
              const active = i === currentStepIndex;
              const done = i < currentStepIndex || currentOrder.status === 'ENTREGADO';
              return (
                <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: done || active ? (currentOrder.status === 'ENTREGADO' ? '#059669' : restaurant.brand_color) : 'var(--gray-100)',
                      color: done || active ? 'white' : 'var(--gray-400)',
                      boxShadow: active ? `0 0 0 3px ${restaurant.brand_color}30` : 'none',
                    }}
                  >
                    {step.icon}
                  </div>
                  <p
                    className="text-[10px] text-center leading-tight"
                    style={{
                      color: done || active ? (currentOrder.status === 'ENTREGADO' ? '#059669' : restaurant.brand_color) : 'var(--text-muted)',
                      fontWeight: active || done ? 700 : 400,
                    }}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Security PIN for Delivery (or Delivery Finished Banner) */}
          {currentOrder.status === 'ENTREGADO' ? (
            <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 flex items-center gap-3">
              <CheckCircle className="text-emerald-600 flex-shrink-0" size={22} />
              <div>
                <span className="text-xs font-black text-emerald-900 tracking-wider uppercase block">
                  Seguimiento Finalizado
                </span>
                <p className="text-[11px] text-emerald-700 leading-tight mt-0.5">
                  El pedido fue entregado satisfactoriamente. ¡Buen provecho!
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/80 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 flex-shrink-0">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <span className="text-xs font-black text-amber-900 tracking-wider uppercase block">
                    PIN de Entrega Segura
                  </span>
                  <p className="text-[11px] text-amber-700 leading-tight mt-0.5">
                    Dicta este código al repartidor al recibir tu pedido
                  </p>
                </div>
              </div>
              <div className="bg-white border-2 border-amber-400 px-3.5 py-1.5 rounded-xl shadow-xs text-center flex-shrink-0">
                <span className="font-mono text-xl font-black tracking-widest text-amber-950">
                  {currentOrder.pin_code || '----'}
                </span>
              </div>
            </div>
          )}

          {/* Delivery info */}
          <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--gray-50)' }}>
            <div className="flex items-center gap-2">
              <MapPin size={14} style={{ color: restaurant.brand_color }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {order.delivery_address}
              </span>
            </div>
            <span className="font-bold text-sm" style={{ color: restaurant.brand_color }}>
              S/ {order.total_amount.toFixed(2)}
            </span>
          </div>

          {/* Action button */}
          {currentOrder.status === 'ENTREGADO' ? (
            <a
              href={`/p/${restaurant.slug}`}
              className="btn btn-secondary btn-full font-bold"
              id="btn-new-order"
            >
              Pedir nuevamente en {restaurant.name}
            </a>
          ) : (
            <a
              href={`tel:${restaurant.phone}`}
              className="btn btn-secondary btn-full"
              id="btn-call-restaurant"
            >
              <Phone size={16} /> Llamar a {restaurant.name}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
