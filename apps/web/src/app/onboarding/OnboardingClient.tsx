'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Store, MapPin, Palette, UserPlus, CreditCard,
  ChevronRight, ChevronLeft, Loader2, CheckCircle,
  ExternalLink,
} from 'lucide-react';
import type { PlanType } from '@/lib/supabase/types';
import { PLAN_LIMITS } from '@/lib/supabase/types';

type OnboardingStep = 1 | 2 | 3 | 4;

interface RestaurantForm {
  name: string;
  slug: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  max_delivery_radius_km: number;
  brand_color: string;
  logo_url: string;
  cover_image_url: string;
  business_hours: Record<string, { open: string; close: string }>;
  admin_email: string;
  admin_password: string;
  plan: PlanType;
}

const DEFAULT_HOURS: Record<string, { open: string; close: string }> = {
  '1': { open: '11:00', close: '22:00' },
  '2': { open: '11:00', close: '22:00' },
  '3': { open: '11:00', close: '22:00' },
  '4': { open: '11:00', close: '22:00' },
  '5': { open: '11:00', close: '22:00' },
  '6': { open: '11:00', close: '22:00' },
  '7': { open: '12:00', close: '21:00' },
};

const DAY_LABELS: Record<string, string> = {
  '1': 'Lunes', '2': 'Martes', '3': 'Miércoles', '4': 'Jueves',
  '5': 'Viernes', '6': 'Sábado', '7': 'Domingo',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function OnboardingClient() {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  const [form, setForm] = useState<RestaurantForm>({
    name: '',
    slug: '',
    phone: '',
    address: '',
    lat: null,
    lng: null,
    max_delivery_radius_km: 10,
    brand_color: '#E53E3E',
    logo_url: '',
    cover_image_url: '',
    business_hours: { ...DEFAULT_HOURS },
    admin_email: '',
    admin_password: '',
    plan: 'STARTER',
  });

  const updateForm = useCallback((updates: Partial<RestaurantForm>) => {
    setForm(prev => ({ ...prev, ...updates }));
  }, []);

  // Auto-generate slug from name
  useEffect(() => {
    if (form.name) {
      updateForm({ slug: slugify(form.name) });
    }
  }, [form.name, updateForm]);

  // Initialize map on step 1
  useEffect(() => {
    if (step !== 1 || !mapContainerRef.current) return;
    let isMounted = true;

    // Clean previous map
    if (mapInstanceRef.current) {
      (mapInstanceRef.current as { remove: () => void }).remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    }

    import('leaflet').then(L => {
      if (!isMounted || !mapContainerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const defaultCenter: [number, number] = form.lat && form.lng
        ? [form.lat, form.lng]
        : [-12.0464, -77.0428]; // Lima, Peru

      const map = L.map(mapContainerRef.current!, { scrollWheelZoom: true }).setView(defaultCenter, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(defaultCenter, { draggable: true }).addTo(map);
      markerRef.current = marker;
      mapInstanceRef.current = map;

      if (form.lat && form.lng) {
        marker.setLatLng([form.lat, form.lng]);
      }

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        updateForm({ lat: pos.lat, lng: pos.lng });
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        updateForm({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    });

    if (!document.getElementById('leaflet-css-onboarding')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-onboarding';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    return () => { isMounted = false; };
  }, [step, form.lat, form.lng, updateForm]);

  const handleSubmit = async () => {
    // Validation
    if (!form.name || !form.slug || !form.phone || !form.address) {
      toast.error('Complete todos los datos del negocio');
      setStep(1);
      return;
    }
    if (!form.lat || !form.lng) {
      toast.error('Ubique el restaurante en el mapa');
      setStep(1);
      return;
    }
    if (!form.admin_email || !form.admin_password) {
      toast.error('Complete las credenciales del administrador');
      setStep(3);
      return;
    }
    if (form.admin_password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // 1. Crear restaurante
      const { data: newRestaurant, error: restError } = await supabase
        .from('restaurants')
        .insert({
          name: form.name,
          slug: form.slug,
          phone: form.phone,
          address: form.address,
          lat: form.lat,
          lng: form.lng,
          max_delivery_radius_km: form.max_delivery_radius_km,
          brand_color: form.brand_color,
          logo_url: form.logo_url || null,
          cover_image_url: form.cover_image_url || null,
          business_hours: form.business_hours,
          is_open: false,
        })
        .select()
        .single();

      if (restError || !newRestaurant) {
        if (restError?.message?.includes('duplicate')) {
          toast.error('Ya existe un restaurante con ese slug. Cambie el nombre o slug.');
        } else {
          toast.error(`Error al crear restaurante: ${restError?.message || 'desconocido'}`);
        }
        throw restError;
      }

      // 2. Crear usuario admin en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.admin_email,
        password: form.admin_password,
      });

      if (authError || !authData.user) {
        toast.error(`Error al crear usuario: ${authError?.message || 'desconocido'}`);
        // Rollback: eliminar restaurante creado
        await supabase.from('restaurants').delete().eq('id', newRestaurant.id);
        throw authError;
      }

      // 3. Vincular usuario con restaurante
      const { error: linkError } = await supabase
        .from('restaurant_users')
        .insert({
          user_id: authData.user.id,
          restaurant_id: newRestaurant.id,
          role: 'owner',
        });

      if (linkError) {
        toast.error(`Error al vincular usuario: ${linkError.message}`);
        throw linkError;
      }

      // 4. Crear suscripción
      const planLimits = PLAN_LIMITS[form.plan];
      const { error: subError } = await supabase
        .from('subscriptions')
        .insert({
          restaurant_id: newRestaurant.id,
          plan: form.plan,
          max_drivers: planLimits.maxDrivers,
          max_orders_per_month: planLimits.maxOrders,
          orders_this_month: 0,
          is_active: true,
        });

      if (subError) {
        toast.error(`Error al crear suscripción: ${subError.message}`);
        throw subError;
      }

      // 5. Crear productos de ejemplo
      const sampleProducts = [
        { name: 'Plato del Día', category: 'Menú del Día', price: 12.00, description: 'Plato principal con guarnición y refresco', sort_order: 0 },
        { name: 'Lomo Saltado', category: 'A la Carta', price: 18.00, description: 'Lomo de res salteado con tomate, cebolla y papas fritas', sort_order: 1 },
        { name: 'Arroz con Pollo', category: 'A la Carta', price: 15.00, description: 'Arroz verde con presa de pollo', sort_order: 2 },
        { name: 'Chicha Morada', category: 'Bebidas', price: 4.00, description: 'Vaso de chicha morada natural', sort_order: 3 },
        { name: 'Agua Mineral', category: 'Bebidas', price: 2.50, description: 'Botella personal 500ml', sort_order: 4 },
      ];

      await supabase.from('products').insert(
        sampleProducts.map(p => ({
          ...p,
          restaurant_id: newRestaurant.id,
          is_available: true,
          available_days: [1, 2, 3, 4, 5, 6, 7],
        }))
      );

      setCreatedSlug(form.slug);
      toast.success(`Restaurante "${form.name}" creado exitosamente`);
    } catch {
      // Errors already toasted above
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success screen
  if (createdSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--saas-900)', fontFamily: 'Inter, sans-serif' }}>
        <div className="fixed inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-8 max-w-lg w-full text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#EEF2FF' }}>
            <CheckCircle size={40} className="text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Restaurante Creado</h1>
          <p className="text-sm text-slate-500 mb-6">
            &ldquo;{form.name}&rdquo; ya está registrado en la plataforma. El administrador puede iniciar sesión con las credenciales proporcionadas.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Tienda pública</span>
              <a href={`/p/${createdSlug}`} target="_blank" rel="noopener noreferrer"
                className="text-indigo-600 font-semibold flex items-center gap-1 hover:underline">
                /p/{createdSlug} <ExternalLink size={12} />
              </a>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Cocina KDS</span>
              <a href={`/kds/${createdSlug}`} target="_blank" rel="noopener noreferrer"
                className="text-indigo-600 font-semibold flex items-center gap-1 hover:underline">
                /kds/{createdSlug} <ExternalLink size={12} />
              </a>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Admin email</span>
              <span className="font-semibold text-slate-800">{form.admin_email}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Plan</span>
              <span className="font-bold text-indigo-600">{PLAN_LIMITS[form.plan]?.label} — S/{PLAN_LIMITS[form.plan]?.price}/mes</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setCreatedSlug(null); setForm(f => ({ ...f, name: '', slug: '', phone: '', address: '', lat: null, lng: null, admin_email: '', admin_password: '' })); setStep(1); }}
              className="btn btn-secondary flex-1">
              Crear otro
            </button>
            <a href="/admin" className="btn btn-indigo flex-1">
              Ir al Panel
            </a>
          </div>
        </div>
      </div>
    );
  }

  const STEP_CONFIG = [
    { num: 1, label: 'Negocio', icon: <Store size={16} /> },
    { num: 2, label: 'Visual', icon: <Palette size={16} /> },
    { num: 3, label: 'Admin', icon: <UserPlus size={16} /> },
    { num: 4, label: 'Plan', icon: <CreditCard size={16} /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--saas-900)', fontFamily: 'Inter, sans-serif' }}>
      {/* Dot pattern */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Nuevo Restaurante</h1>
          <p className="text-sm mt-1" style={{ color: '#A5B4FC' }}>Configuración inicial del negocio</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEP_CONFIG.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <button
                onClick={() => setStep(s.num as OnboardingStep)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  step === s.num
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : step > s.num
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-indigo-900/40 text-indigo-400'
                }`}
              >
                {s.icon} <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEP_CONFIG.length - 1 && (
                <ChevronRight size={14} className="text-indigo-500/40" />
              )}
            </div>
          ))}
        </div>

        {/* Card content */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 animate-fade-in">

          {/* STEP 1: Business Data */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Store size={20} className="text-indigo-600" /> Datos del Negocio
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Nombre del restaurante</label>
                  <input className="form-input" placeholder="Mi Restaurante" value={form.name}
                    onChange={e => updateForm({ name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Slug (URL)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">/p/</span>
                    <input className="form-input" value={form.slug}
                      onChange={e => updateForm({ slug: slugify(e.target.value) })} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Teléfono</label>
                  <input className="form-input" placeholder="999 999 999" value={form.phone}
                    onChange={e => updateForm({ phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Dirección</label>
                  <input className="form-input" placeholder="Av. Principal 123" value={form.address}
                    onChange={e => updateForm({ address: e.target.value })} />
                </div>
              </div>

              {/* Map */}
              <div>
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <MapPin size={14} /> Ubicación del restaurante (click o arrastra el marcador)
                </label>
                <div ref={mapContainerRef} className="w-full h-64 rounded-xl border border-slate-200 overflow-hidden" />
                {form.lat && form.lng && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Coordenadas: {form.lat.toFixed(6)}, {form.lng.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Delivery radius */}
              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Radio máximo de delivery: <strong className="text-indigo-600">{form.max_delivery_radius_km} km</strong>
                </label>
                <input type="range" min={1} max={25} step={0.5} value={form.max_delivery_radius_km}
                  onChange={e => updateForm({ max_delivery_radius_km: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-600" />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>1 km</span><span>25 km</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Visual Customization */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Palette size={20} className="text-indigo-600" /> Personalización Visual
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Color de marca</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.brand_color}
                      onChange={e => updateForm({ brand_color: e.target.value })}
                      className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <input className="form-input flex-1" value={form.brand_color}
                      onChange={e => updateForm({ brand_color: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">URL del Logo (opcional)</label>
                  <input className="form-input" placeholder="https://..." value={form.logo_url}
                    onChange={e => updateForm({ logo_url: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">URL de Imagen de Portada (opcional)</label>
                <input className="form-input" placeholder="https://..." value={form.cover_image_url}
                  onChange={e => updateForm({ cover_image_url: e.target.value })} />
              </div>

              {/* Preview */}
              {(form.name || form.brand_color) && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="h-20" style={{ background: form.brand_color }} />
                  <div className="p-4 flex items-center gap-3">
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="Logo" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: form.brand_color }}>
                        {form.name?.charAt(0) || 'R'}
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-sm text-slate-800">{form.name || 'Nombre del Restaurante'}</p>
                      <p className="text-xs text-slate-500">{form.address || 'Dirección'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Business hours */}
              <div>
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">Horario de atención</label>
                <div className="space-y-2">
                  {Object.entries(DAY_LABELS).map(([dayNum, dayName]) => (
                    <div key={dayNum} className="flex items-center gap-3 text-sm">
                      <span className="w-20 text-xs font-medium text-slate-600">{dayName}</span>
                      <input type="time" className="form-input py-1 px-2 text-xs w-28"
                        value={form.business_hours[dayNum]?.open || '11:00'}
                        onChange={e => {
                          const updated = { ...form.business_hours };
                          updated[dayNum] = { ...updated[dayNum], open: e.target.value };
                          updateForm({ business_hours: updated });
                        }}
                      />
                      <span className="text-slate-400 text-xs">a</span>
                      <input type="time" className="form-input py-1 px-2 text-xs w-28"
                        value={form.business_hours[dayNum]?.close || '22:00'}
                        onChange={e => {
                          const updated = { ...form.business_hours };
                          updated[dayNum] = { ...updated[dayNum], close: e.target.value };
                          updateForm({ business_hours: updated });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Admin Credentials */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <UserPlus size={20} className="text-indigo-600" /> Credenciales del Administrador
              </h2>
              <p className="text-sm text-slate-500">
                Estas credenciales serán utilizadas por el administrador del restaurante para acceder al panel de control.
              </p>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Email del administrador</label>
                <input className="form-input" type="email" placeholder="admin@restaurante.com" value={form.admin_email}
                  onChange={e => updateForm({ admin_email: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500">Contraseña</label>
                <input className="form-input" type="password" placeholder="Mínimo 6 caracteres" value={form.admin_password}
                  onChange={e => updateForm({ admin_password: e.target.value })} />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <strong>Importante:</strong> Guarde estas credenciales en un lugar seguro. El administrador del restaurante las necesitará para iniciar sesión en <code className="bg-amber-100 px-1 rounded">/login</code>.
              </div>
            </div>
          )}

          {/* STEP 4: Plan Selection */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CreditCard size={20} className="text-indigo-600" /> Plan de Suscripción
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(Object.entries(PLAN_LIMITS) as [PlanType, typeof PLAN_LIMITS[PlanType]][]).map(([key, plan]) => {
                  const isSelected = form.plan === key;
                  const isRecommended = key === 'GROWTH';
                  return (
                    <button
                      key={key}
                      onClick={() => updateForm({ plan: key })}
                      className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                          : 'border-slate-200 hover:border-indigo-300 bg-white'
                      }`}
                    >
                      {isRecommended && (
                        <span className="absolute -top-2.5 left-3 text-[9px] font-black uppercase tracking-wider bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                          Recomendado
                        </span>
                      )}
                      <p className={`text-sm font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{plan.label}</p>
                      <p className="text-xl font-black text-slate-800 mt-1">S/ {plan.price}<span className="text-xs font-normal text-slate-500">/mes</span></p>
                      <div className="mt-3 space-y-1 text-[11px] text-slate-500">
                        <p>Hasta <strong className="text-slate-700">{plan.maxDrivers >= 999 ? 'ilimitados' : plan.maxDrivers}</strong> repartidores</p>
                        <p>Hasta <strong className="text-slate-700">{plan.maxOrders >= 999999 ? 'ilimitados' : plan.maxOrders.toLocaleString()}</strong> pedidos/mes</p>
                      </div>
                      {isSelected && (
                        <CheckCircle size={18} className="absolute top-3 right-3 text-indigo-600" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider mb-2">Resumen</h3>
                <div className="flex justify-between"><span className="text-slate-500">Restaurante</span><span className="font-semibold text-slate-800">{form.name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">URL</span><span className="font-mono text-xs text-indigo-600">/p/{form.slug || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Admin</span><span className="font-semibold text-slate-800">{form.admin_email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Plan</span><span className="font-bold text-indigo-600">{PLAN_LIMITS[form.plan]?.label} — S/{PLAN_LIMITS[form.plan]?.price}/mes</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Radio delivery</span><span className="font-semibold text-slate-800">{form.max_delivery_radius_km} km</span></div>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8 pt-5 border-t border-slate-100">
            {step > 1 ? (
              <button onClick={() => setStep((step - 1) as OnboardingStep)} className="btn btn-secondary">
                <ChevronLeft size={16} /> Anterior
              </button>
            ) : (
              <a href="/admin" className="btn btn-ghost text-slate-500">
                Cancelar
              </a>
            )}

            {step < 4 ? (
              <button onClick={() => setStep((step + 1) as OnboardingStep)} className="btn btn-indigo">
                Siguiente <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={isSubmitting} className="btn btn-indigo">
                {isSubmitting ? (
                  <><Loader2 size={16} className="animate-spin" /> Creando...</>
                ) : (
                  <><CheckCircle size={16} /> Crear Restaurante</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
