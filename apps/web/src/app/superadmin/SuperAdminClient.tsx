'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Store, Plus, TrendingUp, ExternalLink,
  CreditCard, LogOut, Boxes, X, Loader2, CheckCircle2,
  MapPin, Navigation, Search,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Restaurant, Subscription } from '@/lib/supabase/types';
import { PLAN_LIMITS } from '@/lib/supabase/types';

interface OrderSummary {
  id: string;
  restaurant_id: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface Props {
  restaurants: Restaurant[];
  subscriptions: Subscription[];
  orders: OrderSummary[];
}

export default function SuperAdminClient({
  restaurants: initialRestaurants,
  subscriptions: initialSubscriptions,
  orders,
}: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(initialRestaurants);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [activeTab, setActiveTab] = useState<'merchants' | 'subscriptions'>('merchants');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState('');
  const [newMerchantSlug, setNewMerchantSlug] = useState('');
  const [newMerchantAddress, setNewMerchantAddress] = useState('Av. Benavides 1240, Miraflores, Lima');
  const [newMerchantRadius, setNewMerchantRadius] = useState('10');
  const [newMerchantPlan, setNewMerchantPlan] = useState<'STARTER' | 'GROWTH' | 'ENTERPRISE'>('GROWTH');
  const [newMerchantLat, setNewMerchantLat] = useState(-12.0864);
  const [newMerchantLng, setNewMerchantLng] = useState(-77.0328);
  // Plan Modal State
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedMerchantForPlan, setSelectedMerchantForPlan] = useState<Restaurant | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<'STARTER' | 'GROWTH' | 'ENTERPRISE'>('GROWTH');
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const supabase = createClient();

  const totalDelivered = orders.filter(o => o.status === 'ENTREGADO').length;
  const totalVolume = orders.filter(o => o.status === 'ENTREGADO').reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // Initialize and update Leaflet map when modal is opened
  useEffect(() => {
    if (!showCreateModal) return;

    let isMounted = true;

    // Load Leaflet dynamically
    import('leaflet').then((L) => {
      if (!isMounted) return;

      const container = document.getElementById('merchant-map-picker');
      if (!container) return;

      if (!mapInstanceRef.current) {
        const map = L.map('merchant-map-picker').setView([newMerchantLat, newMerchantLng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const redPinIcon = L.divIcon({
          className: 'custom-merchant-pin',
          html: `
            <div style="background-color: #DC2626; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(220,38,38,0.5); border: 2.5px solid white;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });

        const marker = L.marker([newMerchantLat, newMerchantLng], {
          draggable: true,
          icon: redPinIcon,
        }).addTo(map);

        const radiusMeters = (parseFloat(newMerchantRadius) || 10) * 1000;
        const circle = L.circle([newMerchantLat, newMerchantLng], {
          radius: radiusMeters,
          color: '#4F46E5',
          fillColor: '#6366F1',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '5, 5',
        }).addTo(map);

        const reverseGeocode = async (lat: number, lng: number) => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const data = await res.json();
            if (data && data.address) {
              const street = data.address.road || data.address.pedestrian || data.address.street || '';
              const houseNumber = data.address.house_number ? ` ${data.address.house_number}` : '';
              const district = data.address.suburb || data.address.city_district || data.address.neighbourhood || '';
              const city = data.address.city || data.address.town || data.address.county || 'Lima';

              let cleanAddress = '';
              if (street) {
                cleanAddress = `${street}${houseNumber}${district ? `, ${district}` : ''}, ${city}`;
              } else if (data.display_name) {
                cleanAddress = data.display_name.split(',').slice(0, 3).join(',').trim();
              }

              if (cleanAddress) {
                setNewMerchantAddress(cleanAddress);
              }
            }
          } catch {}
        };

        marker.on('dragend', (event: any) => {
          const position = event.target.getLatLng();
          const lat = parseFloat(position.lat.toFixed(6));
          const lng = parseFloat(position.lng.toFixed(6));
          setNewMerchantLat(lat);
          setNewMerchantLng(lng);
          circle.setLatLng(position);
          reverseGeocode(lat, lng);
        });

        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          circle.setLatLng(e.latlng);
          const lat = parseFloat(e.latlng.lat.toFixed(6));
          const lng = parseFloat(e.latlng.lng.toFixed(6));
          setNewMerchantLat(lat);
          setNewMerchantLng(lng);
          reverseGeocode(lat, lng);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;

        setTimeout(() => {
          map.invalidateSize();
        }, 200);
      }
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
  }, [showCreateModal]);

  // Update map radius when input changes
  useEffect(() => {
    if (circleRef.current) {
      const radiusMeters = (parseFloat(newMerchantRadius) || 10) * 1000;
      circleRef.current.setRadius(radiusMeters);
    }
  }, [newMerchantRadius]);

  // Geocode address via OpenStreetMap Nominatim
  const handleGeocodeAddress = async () => {
    if (!newMerchantAddress.trim()) return;
    setIsGeocoding(true);
    try {
      const query = encodeURIComponent(`${newMerchantAddress}, Lima, Perú`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setNewMerchantLat(lat);
        setNewMerchantLng(lng);

        if (mapInstanceRef.current && markerRef.current && circleRef.current) {
          const latLng = [lat, lng];
          mapInstanceRef.current.setView(latLng, 14);
          markerRef.current.setLatLng(latLng);
          circleRef.current.setLatLng(latLng);
        }
        toast.success('Ubicación encontrada en el mapa');
      } else {
        toast.info('No se encontró la dirección exacta. Puede arrastrar el marcador manualmente.');
      }
    } catch {
      toast.info('Arrastre el marcador en el mapa para fijar las coordenadas.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleToggleMerchantStatus = async (restaurant: Restaurant) => {
    setUpdatingId(restaurant.id);
    const newStatus = !restaurant.is_open;
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ is_open: newStatus })
        .eq('id', restaurant.id);

      if (error) throw error;
      setRestaurants(prev => prev.map(r => r.id === restaurant.id ? { ...r, is_open: newStatus } : r));
      toast.success(`${restaurant.name} marcado como ${newStatus ? 'ACTIVO' : 'PAUSADO'}`);
    } catch {
      toast.error('Error al actualizar el estado del comercio');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchantName || !newMerchantSlug) {
      toast.error('Nombre e identificador son obligatorios.');
      return;
    }

    setIsCreating(true);
    try {
      const cleanSlug = newMerchantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const radiusKm = parseFloat(newMerchantRadius) || 10;

      // 1. Insert into restaurants with full schema
      const fullPayload = {
        name: newMerchantName.trim(),
        slug: cleanSlug,
        address: newMerchantAddress.trim() || 'Lima, Perú',
        lat: newMerchantLat,
        lng: newMerchantLng,
        max_delivery_radius_km: radiusKm,
        brand_color: '#4F46E5',
        is_open: true,
      };

      const { data: created1, error: err1 } = await supabase
        .from('restaurants')
        .insert(fullPayload)
        .select()
        .single();

      let createdRestaurant: Restaurant | null = created1 as Restaurant | null;

      if (err1 || !createdRestaurant) {
        // Fallback base compatible
        const basePayload = {
          name: newMerchantName.trim(),
          slug: cleanSlug,
          address: `${newMerchantAddress.trim()} [Lat: ${newMerchantLat}, Lng: ${newMerchantLng}, Radio: ${radiusKm}km]`,
          brand_color: '#4F46E5',
          is_open: true,
        };

        const { data: created2, error: err2 } = await supabase
          .from('restaurants')
          .insert(basePayload)
          .select()
          .single();

        if (err2 || !created2) {
          throw new Error(err2?.message || 'Error al crear el comercio');
        }
        createdRestaurant = created2 as Restaurant;
      }

      // 2. Insert subscription
      const planLimits = PLAN_LIMITS[newMerchantPlan];
      const { data: createdSub } = await supabase
        .from('subscriptions')
        .insert({
          restaurant_id: createdRestaurant.id,
          plan: newMerchantPlan,
          max_orders_per_month: planLimits.maxOrders,
          max_drivers: planLimits.maxDrivers,
          orders_this_month: 0,
          is_active: true,
        })
        .select()
        .single();

      // Update local state
      setRestaurants(prev => [createdRestaurant as Restaurant, ...prev]);
      if (createdSub) {
        setSubscriptions(prev => [createdSub as Subscription, ...prev]);
      }

      toast.success(`Comercio "${createdRestaurant.name}" registrado con éxito`);
      setShowCreateModal(false);
      setNewMerchantName('');
      setNewMerchantSlug('');
      setNewMerchantAddress('Av. Benavides 1240, Miraflores, Lima');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al registrar comercio';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMerchantForPlan) return;

    setIsUpdatingPlan(true);
    try {
      const planConfig = PLAN_LIMITS[selectedPlanKey];
      const existingSub = subscriptions.find(s => s.restaurant_id === selectedMerchantForPlan.id);

      if (existingSub) {
        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan: selectedPlanKey,
            max_orders_per_month: planConfig.maxOrders,
            max_drivers: planConfig.maxDrivers,
          })
          .eq('id', existingSub.id);

        if (error) throw error;
        setSubscriptions(prev => prev.map(s => s.id === existingSub.id ? { ...s, plan: selectedPlanKey, max_orders_per_month: planConfig.maxOrders, max_drivers: planConfig.maxDrivers } : s));
      } else {
        const { data: newSub, error } = await supabase
          .from('subscriptions')
          .insert({
            restaurant_id: selectedMerchantForPlan.id,
            plan: selectedPlanKey,
            max_orders_per_month: planConfig.maxOrders,
            max_drivers: planConfig.maxDrivers,
            orders_this_month: 0,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        if (newSub) setSubscriptions(prev => [newSub as Subscription, ...prev]);
      }

      toast.success(`Plan de "${selectedMerchantForPlan.name}" actualizado a ${planConfig.label}`);
      setShowPlanModal(false);
    } catch {
      toast.error('Error al actualizar el plan de suscripción');
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  const handleLogout = async () => {
    document.cookie = 'dtk_role=; path=/; max-age=0';
    document.cookie = 'dtk_tenant=; path=/; max-age=0';
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex flex-col justify-between" style={{ backgroundColor: '#F1F5F9', fontFamily: 'Inter, sans-serif' }}>

      {/* Top Navbar en Índigo SaaS */}
      <header
        className="px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-md text-white"
        style={{ backgroundColor: 'var(--saas-900, #312E81)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md flex-shrink-0"
            style={{ backgroundColor: 'var(--saas-600, #4F46E5)' }}
          >
            <ShieldCheck size={22} color="white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-wide">Delivery Tracker</h1>
              <span className="text-[10px] font-black uppercase bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                SuperAdmin
              </span>
            </div>
            <p className="text-xs text-indigo-200">Consola de Gestión de Clientes, Suscripciones &amp; Plataforma</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-indigo text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            id="btn-register-merchant"
          >
            <Plus size={15} />
            <span>Registrar Comercio</span>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-indigo-200 hover:text-white hover:bg-indigo-800/60 transition-colors"
            title="Cerrar Sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto w-full px-4 py-8 flex-1 space-y-6">

        {/* Global KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Comercios Activos</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                {restaurants.filter(r => r.is_open).length}{' '}
                <span className="text-sm font-semibold text-slate-400">/ {restaurants.length}</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Store size={22} />
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Despachos Entregados</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-1">{totalDelivered}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <TrendingUp size={22} />
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Volumen Procesado</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1">S/ {totalVolume.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <CreditCard size={22} />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab('merchants')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'merchants'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Store size={16} />
            <span>Comercios Registrados ({restaurants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'subscriptions'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CreditCard size={16} />
            <span>Planes &amp; Suscripciones</span>
          </button>
        </div>

        {/* TAB 1: COMERCIOS */}
        {activeTab === 'merchants' && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">
                Directorio de Comercios
              </h3>
              <span className="text-xs text-slate-500">
                Cada comercio opera con su consola de despacho y estación de empaque independiente.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-100">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Comercio</th>
                    <th className="py-3.5 px-4 font-bold">Identificador</th>
                    <th className="py-3.5 px-4 font-bold">Dirección Central &bull; Cobertura</th>
                    <th className="py-3.5 px-4 font-bold">Plan Activo</th>
                    <th className="py-3.5 px-4 font-bold">Cuota de Envíos</th>
                    <th className="py-3.5 px-4 font-bold">Estado del Servicio</th>
                    <th className="py-3.5 px-4 font-bold text-right">Configuración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {restaurants.map(merchant => {
                    const merchantOrders = orders.filter(o => o.restaurant_id === merchant.id);
                    const sub = subscriptions.find(s => s.restaurant_id === merchant.id);
                    const planConfig = sub ? PLAN_LIMITS[sub.plan] : PLAN_LIMITS['GROWTH'];

                    return (
                      <tr key={merchant.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">
                              {merchant.slug === 'fuego-carbon' ? '🔥' : merchant.slug === 'libreria-atenea' ? '📚' : '🏢'}
                            </span>
                            <div>
                              <p className="font-extrabold text-sm text-slate-900">{merchant.name}</p>
                              <span className="text-[10px] text-slate-400 font-mono">ID: {merchant.id.substring(0, 8)}...</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono text-indigo-600 font-bold">
                          {merchant.slug}
                        </td>
                        <td className="py-4 px-4 text-slate-600 max-w-[220px]">
                          <p className="truncate font-medium text-slate-900">{merchant.address || 'Lima, Perú'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              Radio: {merchant.max_delivery_radius_km || 10} km
                            </span>
                            {merchant.lat != null && merchant.lng != null && (
                              <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                                GPS ✓
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                            {planConfig.label} &bull; S/ {planConfig.price}/m
                          </span>
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{merchantOrders.length}</span>
                            <span className="text-slate-400 text-[11px]">/ {planConfig.maxOrders >= 99999 ? 'Ilimitado' : `${planConfig.maxOrders} mes`}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={() => handleToggleMerchantStatus(merchant)}
                            disabled={updatingId === merchant.id}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                              merchant.is_open
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                            }`}
                          >
                            {merchant.is_open ? '● Activo' : '○ Suspendido'}
                          </button>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedMerchantForPlan(merchant);
                              setSelectedPlanKey(sub?.plan || 'GROWTH');
                              setShowPlanModal(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-bold text-[11px] border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <CreditCard size={12} />
                            <span>Modificar Plan</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SUSCRIPCIONES */}
        {activeTab === 'subscriptions' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(PLAN_LIMITS).map(([planKey, plan]) => (
              <div key={planKey} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 relative">
                <div className="flex justify-between items-center">
                  <h4 className="font-extrabold text-base text-slate-900">{plan.label}</h4>
                  <span className="text-xs font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    S/ {plan.price}/mes
                  </span>
                </div>

                <div className="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cuota mensual:</span>
                    <span className="font-bold text-slate-900">{plan.maxOrders} pedidos/mes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Motorizados máx:</span>
                    <span className="font-bold text-slate-900">{plan.maxDrivers} repartidores</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">API B2B Plug &amp; Play:</span>
                    <span className="font-bold text-emerald-600">Incluido</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PIN Anti-Fraude:</span>
                    <span className="font-bold text-emerald-600">Incluido</span>
                  </div>
                </div>

                <div className="pt-2 text-slate-400 text-[11px]">
                  Comercios suscritos: <strong className="text-slate-700">{subscriptions.filter(s => s.plan === planKey).length}</strong>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* MODAL: REGISTRAR NUEVO COMERCIO CON MAPA INTERACTIVO */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-7 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Store size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Registrar Nuevo Comercio</h3>
                  <p className="text-xs text-slate-500">Configuración de sede central, telemetría y radio de cobertura</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMerchant} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-slate-700 font-bold">Nombre Comercial</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ej. Farmacia San Lucas"
                    value={newMerchantName}
                    onChange={(e) => {
                      setNewMerchantName(e.target.value);
                      if (!newMerchantSlug || newMerchantSlug === newMerchantName.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
                        setNewMerchantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'));
                      }
                    }}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label text-slate-700 font-bold">Slug URL / Identificador</label>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="farmacia-san-lucas"
                    value={newMerchantSlug}
                    onChange={(e) => setNewMerchantSlug(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-slate-700 font-bold">Plan de Suscripción</label>
                <select
                  value={newMerchantPlan}
                  onChange={(e) => setNewMerchantPlan(e.target.value as 'STARTER' | 'GROWTH' | 'ENTERPRISE')}
                  className="form-input font-bold text-indigo-700"
                >
                  <option value="STARTER">Starter (500 envíos/mes &bull; 2 repartidores &bull; S/ 149)</option>
                  <option value="GROWTH">Growth (2,000 envíos/mes &bull; 8 repartidores &bull; S/ 299)</option>
                  <option value="ENTERPRISE">Enterprise (Ilimitado &bull; 25 repartidores &bull; S/ 599)</option>
                </select>
              </div>

              {/* DIRECCIÓN Y GEOCODIFICACIÓN */}
              <div className="form-group">
                <label className="form-label text-slate-700 font-bold flex justify-between items-center">
                  <span>Dirección Central de Despacho (Hub / Sede)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Mover pin en el mapa fija las coordenadas</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin size={15} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      className="form-input pl-9"
                      placeholder="ej. Av. Benavides 1240, Miraflores, Lima"
                      value={newMerchantAddress}
                      onChange={(e) => setNewMerchantAddress(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleGeocodeAddress();
                        }
                      }}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGeocodeAddress}
                    disabled={isGeocoding}
                    className="btn btn-indigo text-xs px-3.5 py-2 rounded-lg font-bold flex items-center gap-1.5 shrink-0"
                    title="Buscar dirección en el mapa"
                  >
                    {isGeocoding ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    <span>Ubicar</span>
                  </button>
                </div>
              </div>

              {/* MAPA INTERACTIVO LEAFLET */}
              <div className="space-y-1.5">
                <label className="form-label text-slate-700 font-bold">
                  Punto Central de Despacho en Mapa
                </label>

                <div
                  id="merchant-map-picker"
                  className="w-full h-48 sm:h-52 rounded-2xl border border-slate-300 shadow-inner overflow-hidden relative z-10"
                />
              </div>

              {/* RADIO DE COBERTURA SLIDER & INPUT */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-slate-700">Radio Máximo de Cobertura Delivery</label>
                  <span className="font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                    {newMerchantRadius} Kilómetros
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="35"
                  step="0.5"
                  value={newMerchantRadius}
                  onChange={(e) => setNewMerchantRadius(e.target.value)}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500">
                  Las órdenes fuera del círculo azul serán rechazadas por la API con estado 422 (Fuera de Cobertura).
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn btn-indigo text-xs px-5 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Registrando y Configurando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Crear y Activar Comercio</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MODIFICAR PLAN DE SUSCRIPCIÓN */}
      {showPlanModal && selectedMerchantForPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Modificar Plan de Suscripción</h3>
                  <p className="text-xs text-slate-500">{selectedMerchantForPlan.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPlanModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdatePlan} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-bold text-slate-700">Seleccione el nuevo plan comercial:</label>
                {Object.entries(PLAN_LIMITS).map(([key, plan]) => {
                  const isSelected = selectedPlanKey === key;
                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedPlanKey(key as 'STARTER' | 'GROWTH' | 'ENTERPRISE')}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className={`font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>{plan.label}</p>
                        <p className="text-[11px] text-slate-500">
                          {plan.maxOrders >= 99999 ? 'Envíos ilimitados' : `${plan.maxOrders} envíos/mes`} &bull; {plan.maxDrivers} repartidores
                        </p>
                      </div>
                      <span className={`font-black text-xs px-2.5 py-1 rounded-full ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        S/ {plan.price}/mes
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPlan}
                  className="btn btn-indigo text-xs px-4 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isUpdatingPlan ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Actualizando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Guardar Nuevo Plan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Delivery Tracker &bull; Plataforma de Despacho Logístico &bull; Módulo de SuperAdministración
      </footer>
    </div>
  );
}
