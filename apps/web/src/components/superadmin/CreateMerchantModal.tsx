'use client';

import { useState, useEffect, useRef } from 'react';
import { Store, X, MapPin, Search, Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanType, Restaurant, Subscription } from '@/lib/supabase/types';
import { PLAN_CATALOG, PAID_PLANS, type BillingTransaction } from '@/lib/subscription';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (payload: {
    tenant: Restaurant;
    subscription: Subscription;
    transaction: BillingTransaction | null;
    ownerEmail: string;
  }) => void;
}

export default function CreateMerchantModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ruc, setRuc] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('Av. Benavides 1240, Miraflores, Lima');
  const [radius, setRadius] = useState('10');
  const [plan, setPlan] = useState<PlanType>('STARTER');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [lat, setLat] = useState(-12.0864);
  const [lng, setLng] = useState(-77.0328);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted) return;
      const container = document.getElementById('superadmin-merchant-map');
      if (!container || mapInstanceRef.current) return;

      const map = L.map('superadmin-merchant-map').setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'custom-merchant-pin',
        html: `<div style="background:#0F172A;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#10B981;box-shadow:0 4px 12px rgba(15,23,42,0.4);border:2.5px solid white;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      const marker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map);
      const circle = L.circle([lat, lng], {
        radius: (parseFloat(radius) || 10) * 1000,
        color: '#0F172A',
        fillColor: '#10B981',
        fillOpacity: 0.14,
        weight: 2,
        dashArray: '5, 5',
      }).addTo(map);

      const updateCoords = (newLat: number, newLng: number) => {
        setLat(parseFloat(newLat.toFixed(6)));
        setLng(parseFloat(newLng.toFixed(6)));
        marker.setLatLng([newLat, newLng]);
        circle.setLatLng([newLat, newLng]);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      marker.on('dragend', (ev: any) => {
        const pos = ev.target.getLatLng();
        updateCoords(pos.lat, pos.lng);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('click', (ev: any) => {
        updateCoords(ev.latlng.lat, ev.latlng.lng);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
      setTimeout(() => map.invalidateSize(), 180);
    });

    if (!document.getElementById('leaflet-css-superadmin')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-superadmin';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius((parseFloat(radius) || 10) * 1000);
    }
  }, [radius]);

  if (!open) return null;

  const handleGeocode = async () => {
    if (!address.trim()) return;
    setIsGeocoding(true);
    try {
      const q = encodeURIComponent(`${address}, Lima, Perú`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`);
      const data = await res.json();
      if (data?.length > 0) {
        const nextLat = parseFloat(data[0].lat);
        const nextLng = parseFloat(data[0].lon);
        setLat(nextLat);
        setLng(nextLng);
        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          mapInstanceRef.current.setView([nextLat, nextLng], 14);
          markerRef.current.setLatLng([nextLat, nextLng]);
          circleRef.current.setLatLng([nextLat, nextLng]);
        }
        toast.success('Ubicación fijada en el mapa.');
      } else {
        toast.info('No se encontró la dirección exacta. Arrastra el pin en el mapa.');
      }
    } catch {
      toast.info('Arrastra el pin en el mapa para fijar las coordenadas.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const res = await fetch('/api/superadmin/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          ruc,
          phone,
          address,
          lat,
          lng,
          maxDeliveryRadiusKm: parseFloat(radius) || 10,
          plan,
          ownerEmail,
          ownerPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar el comercio.');

      onCreated({
        tenant: data.tenant as Restaurant,
        subscription: data.subscription as Subscription,
        transaction: (data.transaction ?? null) as BillingTransaction | null,
        ownerEmail: data.ownerEmail,
      });
      toast.success(`Comercio "${data.tenant.name}" y cuenta propietario creados con éxito.`);
      setName('');
      setSlug('');
      setRuc('');
      setPhone('');
      setOwnerEmail('');
      setOwnerPassword('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar comercio.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[1px] p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 my-6 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center">
              <Store size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Alta Presencial de Comercio</h3>
              <p className="text-xs text-slate-500">
                Crea el comercio, su suscripción inicial y las credenciales del propietario
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700">Nombre Comercial *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ej. Farmacia San Lucas"
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  const autoSlug = val
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
                  if (!slug || slug === name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) {
                    setSlug(autoSlug);
                  }
                }}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700">Slug / Identificador *</label>
              <input
                type="text"
                className="form-input font-mono"
                placeholder="farmacia-san-lucas"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700">Teléfono de Contacto *</label>
              <input
                type="tel"
                className="form-input"
                placeholder="987 654 321"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700">DNI / RUC (Opcional)</label>
              <input
                type="text"
                className="form-input font-mono"
                placeholder="20123456789"
                maxLength={11}
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>

          {/* Plan comercial desde PLAN_CATALOG */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-slate-700">Plan Inicial Contratado *</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
              className="form-input font-semibold text-slate-900"
            >
              {PAID_PLANS.map((planKey) => {
                const p = PLAN_CATALOG[planKey];
                return (
                  <option key={planKey} value={planKey}>
                    {p.label} ({p.maxOrders.toLocaleString('es-PE')} pedidos/mes · {p.maxDrivers} repartidores · S/ {p.price}/mes)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Credenciales iniciales del Owner */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <KeyRound size={13} className="text-indigo-600" />
              Cuenta del Propietario (Owner)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label text-xs font-semibold text-slate-600">Correo de acceso *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="admin@comercio.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label text-xs font-semibold text-slate-600">Contraseña inicial *</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Dirección y Mapa */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-slate-700">Dirección Central de Despacho</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  className="form-input form-input-icon"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleGeocode}
                disabled={isGeocoding}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                {isGeocoding ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                Ubicar
              </button>
            </div>
          </div>

          <div
            id="superadmin-merchant-map"
            className="w-full h-44 rounded-xl border border-slate-200 overflow-hidden relative z-10"
          />

          <div className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 rounded-xl">
            <label className="font-semibold text-slate-700">Radio de cobertura</label>
            <input
              type="range"
              min="1"
              max="35"
              step="0.5"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="flex-1 accent-slate-900 cursor-pointer"
            />
            <span className="font-bold text-slate-900 tabular-nums w-14 text-right">{radius} km</span>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Registrando...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} /> Crear Comercio y Propietario
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
