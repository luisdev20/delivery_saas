'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Order, DriverLocation, Restaurant } from '@/lib/supabase/types';
import { MapPin, Package, Truck, CheckCircle, Clock, Phone, ShieldCheck } from 'lucide-react';

interface Props {
  order: Order;
  restaurant: Restaurant;
  initialDriverLocation: DriverLocation | null;
}

const STATUS_STEPS = [
  { key: 'RECIBIDO',       label: 'Recibido',     icon: <Package size={15} /> },
  { key: 'EN_PREPARACION', label: 'Preparando',   icon: <Clock size={15} /> },
  { key: 'LISTO',          label: 'Listo',         icon: <CheckCircle size={15} /> },
  { key: 'EN_CAMINO',      label: 'En camino',    icon: <Truck size={15} /> },
  { key: 'ENTREGADO',      label: 'Entregado',    icon: <CheckCircle size={15} /> },
];

export default function TrackingClient({ order, restaurant, initialDriverLocation }: Props) {
  const [currentOrder, setCurrentOrder] = useState(order);
  const [driverLocation, setDriverLocation] = useState(initialDriverLocation);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const driverMarkerRef = useRef<unknown>(null);
  const supabase = createClient();

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === currentOrder.status);

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
          width:32px;height:32px;background:${restaurant.brand_color};
          border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: '',
      });

      L.marker([order.delivery_lat, order.delivery_lng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>${order.customer_name}</b><br>${order.delivery_address}`);

      leafletMapRef.current = map;

      if (initialDriverLocation) {
        const driverIcon = L.divIcon({
          html: `<div style="
            width:28px;height:28px;background:#111827;border-radius:50%;
            border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;
          ">
            <div style="width:8px;height:8px;background:white;border-radius:50%;"></div>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          className: '',
        });

        const marker = L.marker(
          [initialDriverLocation.current_lat, initialDriverLocation.current_lng],
          { icon: driverIcon }
        ).addTo(map);

        driverMarkerRef.current = marker;

        map.fitBounds([
          [initialDriverLocation.current_lat, initialDriverLocation.current_lng],
          [order.delivery_lat, order.delivery_lng],
        ], { padding: [50, 50] });
      }
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
      const map = leafletMapRef.current as any;
      if (!map) return;

      const driverIcon = L.divIcon({
        html: `<div style="
          width:36px;height:36px;background:#4F46E5;border-radius:50%;
          border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: '',
      });

      if (driverMarkerRef.current) {
        (driverMarkerRef.current as any).setLatLng([driverLocation.current_lat, driverLocation.current_lng]);
      } else {
        driverMarkerRef.current = L.marker(
          [driverLocation.current_lat, driverLocation.current_lng],
          { icon: driverIcon }
        ).addTo(map);
      }

      // Auto fit bounds so customer sees both the driver approaching and their destination
      try {
        map.fitBounds([
          [driverLocation.current_lat, driverLocation.current_lng],
          [currentOrder.delivery_lat, currentOrder.delivery_lng],
        ], { padding: [60, 60], maxZoom: 16 });
      } catch (_) {}
    });
  }, [driverLocation, currentOrder.delivery_lat, currentOrder.delivery_lng]);

  // Subscribe to driver location updates
  useEffect(() => {
    const driverId = currentOrder.driver_id;
    if (!driverId) return;

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
  }, [currentOrder.driver_id, supabase]);

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
          setCurrentOrder((prev: Order) => ({ ...prev, ...(payload.new as Partial<Order>) }));
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

        {currentOrder.status === 'ENTREGADO' && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)', backdropFilter: 'blur(2px)' }}
          >
            <div className="card p-6 text-center mx-4 max-w-sm">
              <CheckCircle size={40} className="mx-auto mb-3" style={{ color: 'var(--status-entregado)' }} />
              <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Pedido entregado</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                Su pedido de {restaurant.name} ha sido entregado exitosamente.
              </p>
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
              const done = i < currentStepIndex;
              return (
                <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: done || active ? restaurant.brand_color : 'var(--gray-100)',
                      color: done || active ? 'white' : 'var(--gray-400)',
                      boxShadow: active ? `0 0 0 3px ${restaurant.brand_color}30` : 'none',
                    }}
                  >
                    {step.icon}
                  </div>
                  <p
                    className="text-[10px] text-center leading-tight"
                    style={{
                      color: done || active ? restaurant.brand_color : 'var(--text-muted)',
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Security PIN for Delivery */}
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
                {order.order_number.toString().padStart(4, '0')}
              </span>
            </div>
          </div>

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

          {/* Call button */}
          <a
            href={`tel:${restaurant.phone}`}
            className="btn btn-secondary btn-full"
            id="btn-call-restaurant"
          >
            <Phone size={16} /> Llamar a {restaurant.name}
          </a>
        </div>
      </div>
    </div>
  );
}
