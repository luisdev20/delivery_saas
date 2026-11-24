'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, Store, Plus, TrendingUp, CreditCard, LogOut, X, Loader2,
  CheckCircle2, MapPin, Search, AlertTriangle, Ban, RotateCcw,
  Receipt, CalendarClock, DatabaseZap, BarChart3, Wallet,
  Building2, TimerReset, ShieldAlert,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatDatePen, formatPen } from '@/lib/subscription';
import { PLAN_LIMITS } from '@/lib/supabase/types';
import type { PlanType } from '@/lib/supabase/types';
import type {
  SuperAdminData,
  SuperAdminTenant,
} from '@/lib/server/superadmin';

type Tab = 'overview' | 'merchants' | 'payments' | 'retention';

interface Props {
  data: SuperAdminData;
  email: string | null;
}

function num(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const PLAN_OPTIONS: PlanType[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];

const STATUS_TONES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TRIAL: 'bg-sky-50 text-sky-700 border-sky-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  NONE: 'bg-slate-100 text-slate-600 border-slate-200',
};

const RETENTION_TONES: Record<string, string> = {
  ACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  GRACE: 'bg-amber-50 text-amber-700 border-amber-200',
  NOTICE: 'bg-orange-50 text-orange-700 border-orange-200',
  FINAL_NOTICE: 'bg-rose-50 text-rose-700 border-rose-200',
  DUE: 'bg-red-100 text-red-800 border-red-300',
  HOLD: 'bg-violet-50 text-violet-700 border-violet-200',
};

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tone}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-extrabold text-slate-900 mt-2 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl shadow-xs ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function SuperAdminClient({ data, email }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [paymentView, setPaymentView] = useState<'all' | 'month' | 'manual'>('all');
  const [busyTenant, setBusyTenant] = useState<string | null>(null);

  // Alta de comercio
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newAddress, setNewAddress] = useState('Av. Benavides 1240, Miraflores, Lima');
  const [newRadius, setNewRadius] = useState('10');
  const [newPlan, setNewPlan] = useState<PlanType>('GROWTH');
  const [newLat, setNewLat] = useState(-12.0864);
  const [newLng, setNewLng] = useState(-77.0328);

  // Cambio de plan
  const [planTarget, setPlanTarget] = useState<SuperAdminTenant | null>(null);
  const [planKey, setPlanKey] = useState<PlanType>('GROWTH');
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  // Registro de cobro
  const [showPayment, setShowPayment] = useState(false);
  const [paymentTenant, setPaymentTenant] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<PlanType>('GROWTH');
  const [paymentMethod, setPaymentMethod] = useState<'YAPE' | 'TARJETA'>('YAPE');
  const [yapePhone, setYapePhone] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Purga anticipada
  const [purgeTarget, setPurgeTarget] = useState<SuperAdminTenant | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const circleRef = useRef<unknown>(null);

  const filteredTenants = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.tenants;
    return data.tenants.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(term) ||
        tenant.slug.toLowerCase().includes(term)
    );
  }, [data.tenants, search]);

  const filteredTransactions = useMemo(() => {
    const currentMonth = data.generatedAt.slice(0, 7);
    return data.transactions.filter((transaction) => {
      if (paymentView === 'month') {
        return transaction.created_at.slice(0, 7) === currentMonth;
      }
      if (paymentView === 'manual') {
        return transaction.payment_method !== 'TRIAL';
      }
      return true;
    });
  }, [data.transactions, data.generatedAt, paymentView]);

  const maxRevenue = useMemo(
    () => Math.max(1, ...data.revenueSeries.map((point) => point.amount)),
    [data.revenueSeries]
  );

  const attentionTenants = useMemo(
    () =>
      data.tenants.filter((tenant) =>
        ['NOTICE', 'FINAL_NOTICE', 'DUE'].includes(tenant.retentionStage)
      ),
    [data.tenants]
  );

  // Mapa de selección de sede al registrar un comercio
  useEffect(() => {
    if (!showCreate) return;

    let mounted = true;

    import('leaflet').then((L) => {
      if (!mounted) return;

      const container = document.getElementById('merchant-map-picker');
      if (!container) return;

      if (!mapRef.current) {
        const map = L.map('merchant-map-picker').setView([newLat, newLng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const pin = L.divIcon({
          className: 'merchant-pin',
          html: `<div style="background-color:#4F46E5;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 12px rgba(79,70,229,.45);border:2px solid #fff">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker([newLat, newLng], { draggable: true, icon: pin }).addTo(map);

        const radiusMeters = (parseFloat(newRadius) || 10) * 1000;
        const circle = L.circle([newLat, newLng], {
          radius: radiusMeters,
          color: '#4F46E5',
          fillColor: '#6366F1',
          fillOpacity: 0.14,
          weight: 2,
          dashArray: '5, 5',
        }).addTo(map);

        const reverseGeocode = async (lat: number, lng: number) => {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
            );
            const payload = await res.json();
            const address = payload?.address;
            if (!address) return;

            const street = address.road || address.pedestrian || address.street || '';
            const number = address.house_number ? ` ${address.house_number}` : '';
            const district =
              address.suburb || address.city_district || address.neighbourhood || '';
            const city = address.city || address.town || address.county || 'Lima';

            if (street) {
              setNewAddress(`${street}${number}${district ? `, ${district}` : ''}, ${city}`);
            } else if (payload.display_name) {
              setNewAddress(payload.display_name.split(',').slice(0, 3).join(',').trim());
            }
          } catch {
            /* la dirección se completa a mano */
          }
        };

        marker.on('dragend', (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
          const position = event.target.getLatLng();
          const lat = parseFloat(position.lat.toFixed(6));
          const lng = parseFloat(position.lng.toFixed(6));
          setNewLat(lat);
          setNewLng(lng);
          circle.setLatLng(position);
          reverseGeocode(lat, lng);
        });

        map.on('click', (event: { latlng: { lat: number; lng: number } }) => {
          marker.setLatLng(event.latlng);
          circle.setLatLng(event.latlng);
          const lat = parseFloat(event.latlng.lat.toFixed(6));
          const lng = parseFloat(event.latlng.lng.toFixed(6));
          setNewLat(lat);
          setNewLng(lng);
          reverseGeocode(lat, lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;

        setTimeout(() => map.invalidateSize(), 180);
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
      mounted = false;
      const map = mapRef.current as { remove: () => void } | null;
      if (map) map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const circle = circleRef.current as { setRadius: (value: number) => void } | null;
    if (circle) circle.setRadius((parseFloat(newRadius) || 10) * 1000);
  }, [newRadius]);

  const geocodeAddress = async () => {
    if (!newAddress.trim()) return;
    setIsGeocoding(true);
    try {
      const query = encodeURIComponent(`${newAddress}, Lima, Perú`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const results = await res.json();

      if (results?.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        setNewLat(lat);
        setNewLng(lng);
        const map = mapRef.current as { setView: (p: [number, number], z: number) => void } | null;
        const marker = markerRef.current as { setLatLng: (p: [number, number]) => void } | null;
        const circle = circleRef.current as { setLatLng: (p: [number, number]) => void } | null;
        map?.setView([lat, lng], 14);
        marker?.setLatLng([lat, lng]);
        circle?.setLatLng([lat, lng]);
        toast.success('Sede ubicada en el mapa');
      } else {
        toast.info('No se encontró la dirección exacta. Ajusta el marcador manualmente.');
      }
    } catch {
      toast.info('Ajusta el marcador manualmente para fijar las coordenadas.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const toggleStore = async (tenant: SuperAdminTenant) => {
    setBusyTenant(tenant.id);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ is_open: !tenant.isOpen })
        .eq('id', tenant.id);

      if (error) throw error;
      toast.success(`${tenant.name} ${tenant.isOpen ? 'pausado' : 'habilitado'} para recibir pedidos.`);
      router.refresh();
    } catch {
      toast.error('No se pudo actualizar el estado operativo del comercio.');
    } finally {
      setBusyTenant(null);
    }
  };

  const createMerchant = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newName.trim() || !newSlug.trim()) {
      toast.error('Nombre comercial e identificador son obligatorios.');
      return;
    }

    setIsCreating(true);
    try {
      const slug = newSlug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const { data: tenant, error } = await supabase
        .from('tenants')
        .insert({
          name: newName.trim(),
          slug,
          phone: '988000000',
          address: newAddress.trim() || 'Lima, Perú',
          lat: newLat,
          lng: newLng,
          max_delivery_radius_km: parseFloat(newRadius) || 10,
          brand_color: '#4F46E5',
          is_open: true,
        })
        .select()
        .single();

      if (error || !tenant) {
        throw new Error(error?.message || 'No se pudo registrar el comercio.');
      }

      const limits = PLAN_LIMITS[newPlan];
      await supabase.from('subscriptions').insert({
        tenant_id: tenant.id,
        plan: newPlan,
        max_orders_per_month: limits.maxOrders,
        max_drivers: limits.maxDrivers,
        orders_this_month: 0,
        is_active: true,
        billing_cycle_start: new Date().toISOString().slice(0, 10),
      });

      toast.success(`Comercio ${tenant.name} incorporado a la plataforma.`);
      setShowCreate(false);
      setNewName('');
      setNewSlug('');
      setNewAddress('Av. Benavides 1240, Miraflores, Lima');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el comercio.');
    } finally {
      setIsCreating(false);
    }
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!planTarget) return;

    setIsSavingPlan(true);
    try {
      const limits = PLAN_LIMITS[planKey];
      const existing = await supabase
        .from('subscriptions')
        .select('id')
        .eq('tenant_id', planTarget.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.data?.id) {
        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan: planKey,
            max_orders_per_month: limits.maxOrders,
            max_drivers: limits.maxDrivers,
          })
          .eq('id', existing.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subscriptions').insert({
          tenant_id: planTarget.id,
          plan: planKey,
          max_orders_per_month: limits.maxOrders,
          max_drivers: limits.maxDrivers,
          orders_this_month: 0,
          is_active: true,
          billing_cycle_start: new Date().toISOString().slice(0, 10),
        });
        if (error) throw error;
      }

      toast.success(`Plan de ${planTarget.name} actualizado a ${PLAN_LIMITS[planKey].label}.`);
      setPlanTarget(null);
      router.refresh();
    } catch {
      toast.error('No se pudo actualizar el plan del comercio.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const registerPayment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!paymentTenant) {
      toast.error('Selecciona el comercio que realiza el pago.');
      return;
    }

    setIsRegistering(true);
    try {
      const response = await fetch('/api/superadmin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: paymentTenant,
          plan: paymentPlan,
          paymentMethod,
          yapePhone: paymentMethod === 'YAPE' ? yapePhone : undefined,
          cardLastFour: paymentMethod === 'TARJETA' ? cardLastFour : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar el cobro.');

      toast.success('Cobro registrado y ciclo de facturación renovado.');
      setShowPayment(false);
      setYapePhone('');
      setCardLastFour('');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el cobro.');
    } finally {
      setIsRegistering(false);
    }
  };

  const runRetentionAction = async (
    tenant: SuperAdminTenant,
    action: 'extend' | 'hold' | 'release'
  ) => {
    setBusyTenant(tenant.id);
    try {
      const response = await fetch('/api/superadmin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, action, days: 30 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar la retención.');

      const messages: Record<string, string> = {
        extend: 'Retención prorrogada por 30 días.',
        hold: 'Cuenta resguardada: la purga automática queda desactivada.',
        release: 'Resguardo liberado. La cuenta vuelve al cronograma vigente.',
      };
      toast.success(messages[action]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la retención.');
    } finally {
      setBusyTenant(null);
    }
  };

  const purgeTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!purgeTarget) return;

    if (purgeConfirm !== purgeTarget.slug) {
      toast.error('El identificador no coincide con el comercio seleccionado.');
      return;
    }

    setIsPurging(true);
    try {
      const response = await fetch('/api/superadmin/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: purgeTarget.id,
          action: 'purge',
          confirmSlug: purgeConfirm,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'No se pudo eliminar el comercio.');

      toast.success('Comercio y cuentas asociadas eliminados de forma definitiva.');
      setPurgeTarget(null);
      setPurgeConfirm('');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el comercio.');
    } finally {
      setIsPurging(false);
    }
  };

  const logout = async () => {
    document.cookie = 'dtk_role=; path=/; max-age=0';
    document.cookie = 'dtk_tenant=; path=/; max-age=0';
    try {
      await supabase.auth.signOut();
    } catch {
      /* continuar al login */
    }
    router.push('/login');
    router.refresh();
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'overview', label: 'Resumen', icon: <BarChart3 size={15} /> },
    { id: 'merchants', label: 'Empresas', icon: <Building2 size={15} />, badge: data.tenants.length },
    { id: 'payments', label: 'Pagos', icon: <Receipt size={15} /> },
    {
      id: 'retention',
      label: 'Retención',
      icon: <DatabaseZap size={15} />,
      badge: data.kpis.retentionAlerts || undefined,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F1F5F9' }}>
      <header className="px-5 sm:px-8 py-4 text-white sticky top-0 z-30 shadow-md" style={{ backgroundColor: '#312E81' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md" style={{ backgroundColor: '#4F46E5' }}>
              <ShieldCheck size={21} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-wide">DeliveryOS</h1>
                <span className="text-[10px] font-black uppercase bg-indigo-500/30 text-indigo-100 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  Plataforma
                </span>
              </div>
              <p className="text-[11px] text-indigo-200">
                {email ?? 'Superadministración'} · datos al {formatDatePen(data.generatedAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-bold shadow-sm transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Registrar comercio</span>
            </button>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 rounded-xl text-indigo-200 hover:text-white hover:bg-indigo-800/60 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200 sticky top-[73px] z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-8 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.icon}
              {item.label}
              {item.badge ? (
                <span className="ml-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Kpi
                label="Empresas administradas"
                value={num(data.kpis.totalTenants)}
                hint={`${num(data.kpis.openTenants)} operando · ${num(data.kpis.totalTenants - data.kpis.openTenants)} pausadas`}
                icon={<Store size={17} />}
                tone="bg-indigo-50 border-indigo-100 text-indigo-600"
              />
              <Kpi
                label="Ingreso recurrente"
                value={formatPen(data.kpis.mrr)}
                hint={`${num(data.kpis.activeSubscriptions)} suscripciones vigentes`}
                icon={<TrendingUp size={17} />}
                tone="bg-emerald-50 border-emerald-100 text-emerald-600"
              />
              <Kpi
                label="Cobrado este mes"
                value={formatPen(data.kpis.collectedThisMonth)}
                hint={`${formatPen(data.kpis.collectedTotal)} acumulado histórico`}
                icon={<Wallet size={17} />}
                tone="bg-amber-50 border-amber-100 text-amber-600"
              />
              <Kpi
                label="Volumen despachado"
                value={formatPen(data.kpis.volumeDelivered)}
                hint={`${num(data.kpis.deliveredTotal)} entregas completadas`}
                icon={<CreditCard size={17} />}
                tone="bg-sky-50 border-sky-100 text-sky-600"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Panel
                title="Cobranza de los últimos 6 meses"
                subtitle="Comprobantes registrados con estado pagado"
                className="lg:col-span-2"
              >
                <div className="px-5 py-5">
                  <div className="flex items-end gap-3 sm:gap-5 h-44">
                    {data.revenueSeries.map((point) => {
                      const height = Math.max(4, Math.round((point.amount / maxRevenue) * 100));
                      return (
                        <div key={point.key} className="flex-1 flex flex-col items-center gap-2 h-full">
                          <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                            {point.amount > 0 ? formatPen(point.amount) : '—'}
                          </span>
                          <div className="relative w-full flex-1 flex items-end justify-center">
                            <div
                              className="w-full max-w-[46px] rounded-t-md bg-indigo-500/85"
                              style={{ height: `${height}%`, minHeight: 4 }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {point.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>

              <Panel title="Distribución por plan" subtitle="Cartera actual de suscripciones">
                <div className="p-5 space-y-4">
                  {data.planBreakdown.map((plan) => {
                    const share = data.kpis.totalTenants
                      ? Math.round((plan.tenants / data.kpis.totalTenants) * 100)
                      : 0;
                    return (
                      <div key={plan.plan}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{plan.label}</span>
                          <span className="text-slate-500">
                            {num(plan.tenants)} · {formatPen(plan.price)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${share}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{share}% de la cartera</p>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel
                title="Cuentas que requieren decisión"
                subtitle="Avisos activos y purgas pendientes"
                action={
                  <button
                    onClick={() => setTab('retention')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver retención
                  </button>
                }
              >
                {attentionTenants.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
                    <p className="text-xs text-slate-500 mt-2">
                      Ninguna cuenta está en proceso de eliminación.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {attentionTenants.slice(0, 6).map((tenant) => (
                      <li key={tenant.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{tenant.name}</p>
                          <p className="text-[11px] text-slate-500">
                            Purga {formatDatePen(tenant.purgeAt)} · {tenant.daysUntilPurge} días
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide border px-2 py-1 rounded-full ${RETENTION_TONES[tenant.retentionStage]}`}>
                          {tenant.retentionLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Últimos movimientos"
                subtitle="Cobros registrados en la plataforma"
                action={
                  <button
                    onClick={() => setTab('payments')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    Ver pagos
                  </button>
                }
              >
                {data.transactions.length === 0 ? (
                  <div className="px-5 py-10 text-center text-xs text-slate-500">
                    Aún no se registran cobros.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.transactions.slice(0, 6).map((transaction) => (
                      <li key={transaction.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{transaction.tenantName}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{transaction.transaction_code}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-900">{formatPen(transaction.amount_pen)}</p>
                          <p className="text-[10px] text-slate-400">{formatDatePen(transaction.created_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}

        {tab === 'merchants' && (
          <Panel
            title="Cartera de empresas"
            subtitle="Sedes, planes, consumo y estado del servicio"
            action={
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar comercio"
                  className="form-input form-input-icon !py-2 !text-xs w-52"
                />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4 font-bold">Comercio</th>
                    <th className="py-3 px-4 font-bold">Plan</th>
                    <th className="py-3 px-4 font-bold">Servicio</th>
                    <th className="py-3 px-4 font-bold">Cuota del ciclo</th>
                    <th className="py-3 px-4 font-bold">Retención</th>
                    <th className="py-3 px-4 font-bold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">{tenant.name}</p>
                        <p className="text-[11px] text-indigo-600 font-mono">{tenant.slug}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          {tenant.planLabel}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">{formatPen(tenant.price)} / mes</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${STATUS_TONES[tenant.status]}`}>
                          {tenant.statusLabel}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {tenant.status === 'EXPIRED' || tenant.status === 'NONE'
                            ? `Venció ${formatDatePen(tenant.periodEnd)}`
                            : `Renueva ${formatDatePen(tenant.periodEnd)}`}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-800">
                          {num(tenant.ordersThisMonth)} / {num(tenant.maxOrders)}
                        </p>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tenant.usagePercent >= 100
                                ? 'bg-red-500'
                                : tenant.usagePercent >= 80
                                  ? 'bg-amber-500'
                                  : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min(tenant.usagePercent, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">{num(tenant.ordersTotal)} despachos históricos</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${RETENTION_TONES[tenant.retentionStage]}`}>
                          {tenant.retentionLabel}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {tenant.hold ? 'Purga desactivada' : `Purga ${formatDatePen(tenant.purgeAt)}`}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setPlanTarget(tenant);
                              setPlanKey(tenant.plan ?? 'GROWTH');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-indigo-700"
                          >
                            <CreditCard size={12} />
                            Plan
                          </button>
                          <button
                            onClick={() => toggleStore(tenant)}
                            disabled={busyTenant === tenant.id}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50 ${
                              tenant.isOpen
                                ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {tenant.isOpen ? <Ban size={12} /> : <RotateCcw size={12} />}
                            {tenant.isOpen ? 'Pausar' : 'Habilitar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTenants.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-500">
                No hay comercios que coincidan con la búsqueda.
              </div>
            )}
          </Panel>
        )}

        {tab === 'payments' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Kpi
                label="Cobrado este mes"
                value={formatPen(data.kpis.collectedThisMonth)}
                hint="Comprobantes pagados del ciclo en curso"
                icon={<Wallet size={17} />}
                tone="bg-emerald-50 border-emerald-100 text-emerald-600"
              />
              <Kpi
                label="Ingreso recurrente"
                value={formatPen(data.kpis.mrr)}
                hint="Valor mensual de las suscripciones vigentes"
                icon={<TrendingUp size={17} />}
                tone="bg-indigo-50 border-indigo-100 text-indigo-600"
              />
              <Kpi
                label="Suscripciones vencidas"
                value={num(data.kpis.expiredSubscriptions)}
                hint={`${num(data.kpis.trialSubscriptions)} cuentas en periodo de prueba`}
                icon={<TimerReset size={17} />}
                tone="bg-rose-50 border-rose-100 text-rose-600"
              />
            </div>

            <Panel
              title="Seguimiento de pagos"
              subtitle="Comprobantes emitidos y renovaciones de ciclo"
              action={
                <button
                  onClick={() => {
                    setShowPayment(true);
                    if (!paymentTenant && data.tenants[0]) {
                      setPaymentTenant(data.tenants[0].id);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-[11px] font-bold text-white"
                >
                  <Plus size={13} />
                  Registrar cobro
                </button>
              }
            >
              <div className="px-5 py-3 border-b border-slate-100 flex gap-2">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'month', label: 'Mes en curso' },
                    { id: 'manual', label: 'Yape y tarjeta' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setPaymentView(option.id)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors ${
                      paymentView === option.id
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4 font-bold">Comprobante</th>
                      <th className="py-3 px-4 font-bold">Comercio</th>
                      <th className="py-3 px-4 font-bold">Plan</th>
                      <th className="py-3 px-4 font-bold">Método</th>
                      <th className="py-3 px-4 font-bold">Monto</th>
                      <th className="py-3 px-4 font-bold">Estado</th>
                      <th className="py-3 px-4 font-bold">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                          {transaction.transaction_code}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{transaction.tenantName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{transaction.tenantSlug}</p>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {PLAN_LIMITS[transaction.plan_selected as PlanType]?.label ?? transaction.plan_selected}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-bold uppercase border border-slate-200 bg-slate-50 px-2 py-0.5 rounded-full text-slate-600">
                            {transaction.payment_method === 'TRIAL'
                              ? 'Trial'
                              : transaction.payment_method === 'YAPE'
                                ? 'Yape'
                                : 'Tarjeta'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {formatPen(transaction.amount_pen)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-bold uppercase border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                            {transaction.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {formatDatePen(transaction.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredTransactions.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-500">
                  No hay comprobantes para el filtro seleccionado.
                </div>
              )}
            </Panel>
          </>
        )}

        {tab === 'retention' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Conservación de datos',
                  value: `${data.retention.policy.graceDays} días`,
                  hint: 'Tras el vencimiento del ciclo, en modo solo lectura.',
                  icon: <DatabaseZap size={17} />,
                  tone: 'bg-slate-50 border-slate-200 text-slate-700',
                },
                {
                  label: 'Primer aviso',
                  value: `${data.retention.policy.noticeDays} días antes`,
                  hint: 'Notificación al propietario y alerta en el panel.',
                  icon: <CalendarClock size={17} />,
                  tone: 'bg-amber-50 border-amber-100 text-amber-700',
                },
                {
                  label: 'Último aviso',
                  value: `${data.retention.policy.finalNoticeDays} días antes`,
                  hint: 'Confirmación final previa a la purga definitiva.',
                  icon: <ShieldAlert size={17} />,
                  tone: 'bg-rose-50 border-rose-100 text-rose-700',
                },
              ].map((item) => (
                <div key={item.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-start justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${item.tone}`}>
                      {item.icon}
                    </div>
                  </div>
                  <p className="text-xl font-extrabold text-slate-900 mt-2">{item.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{item.hint}</p>
                </div>
              ))}
            </div>

            <Panel
              title="Gobierno de datos por comercio"
              subtitle="Cronograma calculado desde el fin del ciclo facturado"
            >
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                  {data.retention.grace} en gracia
                </span>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-orange-700">
                  {data.retention.notice} con aviso
                </span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                  {data.retention.final + data.retention.due} por eliminar
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4 font-bold">Comercio</th>
                      <th className="py-3 px-4 font-bold">Fin de ciclo</th>
                      <th className="py-3 px-4 font-bold">Purga programada</th>
                      <th className="py-3 px-4 font-bold">Estado</th>
                      <th className="py-3 px-4 font-bold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">{tenant.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{tenant.slug}</p>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDatePen(tenant.periodEnd)}</td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-slate-800">{formatDatePen(tenant.purgeAt)}</p>
                          <p className="text-[10px] text-slate-400">
                            {tenant.hold
                              ? 'Fuera del cronograma'
                              : tenant.daysUntilPurge === 0
                                ? 'Plazo cumplido'
                                : `${tenant.daysUntilPurge} días restantes`}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${RETENTION_TONES[tenant.retentionStage]}`}>
                            {tenant.retentionLabel}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => runRetentionAction(tenant, 'extend')}
                              disabled={busyTenant === tenant.id}
                              className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-indigo-700 disabled:opacity-50"
                            >
                              +30 días
                            </button>
                            <button
                              onClick={() => runRetentionAction(tenant, tenant.hold ? 'release' : 'hold')}
                              disabled={busyTenant === tenant.id}
                              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50 ${
                                tenant.hold
                                  ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {tenant.hold ? 'Liberar' : 'Resguardar'}
                            </button>
                            <button
                              onClick={() => {
                                setPurgeTarget(tenant);
                                setPurgeConfirm('');
                              }}
                              className="rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 text-[11px] font-bold text-rose-700"
                            >
                              Purgar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {data.recentDeletions.length > 0 && (
              <Panel title="Eliminaciones ejecutadas" subtitle="Registro de auditoría de las últimas purgas">
                <ul className="divide-y divide-slate-100">
                  {data.recentDeletions.map((item, index) => (
                    <li key={`${item.tenantSlug}-${index}`} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.tenantName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{item.tenantSlug}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-600">{formatDatePen(item.createdAt)}</p>
                        <p className="text-[10px] text-slate-400">
                          {item.orders !== null ? `${num(item.orders)} despachos eliminados` : 'Purga manual'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-[11px] text-slate-400">
        DeliveryOS · Consola de plataforma · Gobierno de comercios, cobranza y retención de datos
      </footer>

      {/* Alta de comercio */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Store size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Registrar comercio</h3>
                  <p className="text-xs text-slate-500">Sede de despacho, cobertura y plan contratado</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createMerchant} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-slate-700 font-bold">Nombre comercial</label>
                  <input
                    value={newName}
                    onChange={(event) => {
                      setNewName(event.target.value);
                      if (!newSlug) {
                        setNewSlug(
                          event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, '-')
                            .replace(/-+/g, '-')
                        );
                      }
                    }}
                    className="form-input"
                    placeholder="Farmacia San Lucas"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-slate-700 font-bold">Identificador</label>
                  <input
                    value={newSlug}
                    onChange={(event) => setNewSlug(event.target.value)}
                    className="form-input font-mono"
                    placeholder="farmacia-san-lucas"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-slate-700 font-bold">Plan</label>
                <select
                  value={newPlan}
                  onChange={(event) => setNewPlan(event.target.value as PlanType)}
                  className="form-input font-bold text-indigo-700"
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {PLAN_LIMITS[plan].label} · {PLAN_LIMITS[plan].maxOrders} despachos ·
                      {' '}{PLAN_LIMITS[plan].maxDrivers} motorizados · {formatPen(PLAN_LIMITS[plan].price)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-slate-700 font-bold flex justify-between items-center">
                  <span>Dirección de la sede</span>
                  <span className="text-[10px] text-slate-400 font-normal">El marcador fija las coordenadas</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin size={15} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      value={newAddress}
                      onChange={(event) => setNewAddress(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          geocodeAddress();
                        }
                      }}
                      className="form-input form-input-icon"
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={geocodeAddress}
                    disabled={isGeocoding}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 font-bold text-white disabled:opacity-60"
                  >
                    {isGeocoding ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    Ubicar
                  </button>
                </div>
              </div>

              <div
                id="merchant-map-picker"
                className="w-full h-48 rounded-xl border border-slate-300 overflow-hidden relative z-10"
              />

              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <label className="font-bold text-slate-700">Radio de cobertura</label>
                  <span className="font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                    {newRadius} km
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="35"
                  step="0.5"
                  value={newRadius}
                  onChange={(event) => setNewRadius(event.target.value)}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 font-bold text-white disabled:opacity-60"
                >
                  {isCreating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Crear comercio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cambio de plan */}
      {planTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Modificar plan</h3>
                  <p className="text-xs text-slate-500">{planTarget.name}</p>
                </div>
              </div>
              <button
                onClick={() => setPlanTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={savePlan} className="space-y-4 text-xs">
              <div className="space-y-2">
                {PLAN_OPTIONS.map((plan) => {
                  const selected = planKey === plan;
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setPlanKey(plan)}
                      className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/70'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <p className={`font-bold ${selected ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {PLAN_LIMITS[plan].label}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {num(PLAN_LIMITS[plan].maxOrders)} despachos · {PLAN_LIMITS[plan].maxDrivers} motorizados
                        </p>
                      </div>
                      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {formatPen(PLAN_LIMITS[plan].price)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPlanTarget(null)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPlan}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 font-bold text-white disabled:opacity-60"
                >
                  {isSavingPlan ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Guardar plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Registro de cobro */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <Receipt size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Registrar cobro</h3>
                  <p className="text-xs text-slate-500">Renueva el ciclo y emite el comprobante</p>
                </div>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={registerPayment} className="space-y-4 text-xs">
              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Comercio</label>
                <select
                  value={paymentTenant}
                  onChange={(event) => setPaymentTenant(event.target.value)}
                  className="form-input"
                  required
                >
                  <option value="">Selecciona un comercio</option>
                  {data.tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} · {tenant.slug}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label font-bold text-slate-700">Plan cobrado</label>
                <select
                  value={paymentPlan}
                  onChange={(event) => setPaymentPlan(event.target.value as PlanType)}
                  className="form-input font-bold text-indigo-700"
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {PLAN_LIMITS[plan].label} · {formatPen(PLAN_LIMITS[plan].price)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(['YAPE', 'TARJETA'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-xl border px-3 py-2 font-bold transition-colors ${
                      paymentMethod === method
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {method === 'YAPE' ? 'Yape' : 'Tarjeta'}
                  </button>
                ))}
              </div>

              {paymentMethod === 'YAPE' ? (
                <div className="form-group">
                  <label className="form-label font-bold text-slate-700">Celular de Yape</label>
                  <input
                    value={yapePhone}
                    onChange={(event) => setYapePhone(event.target.value.replace(/\D/g, '').slice(0, 9))}
                    className="form-input font-mono"
                    placeholder="987654321"
                    inputMode="numeric"
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label font-bold text-slate-700">Últimos 4 dígitos</label>
                  <input
                    value={cardLastFour}
                    onChange={(event) => setCardLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="form-input font-mono"
                    placeholder="4821"
                    inputMode="numeric"
                    required
                  />
                </div>
              )}

              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3 flex items-center justify-between">
                <span className="text-slate-600 font-semibold">Total a registrar</span>
                <span className="font-black text-slate-900 text-sm">{formatPen(PLAN_LIMITS[paymentPlan].price)}</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayment(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 font-bold text-white disabled:opacity-60"
                >
                  {isRegistering ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirmar cobro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purga definitiva */}
      {purgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle size={19} />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Eliminación definitiva</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Se eliminarán el comercio, sus despachos, motorizados, claves de API y cuentas de acceso.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-800">
              <p className="font-bold">{purgeTarget.name}</p>
              <p className="font-mono text-[11px] mt-0.5">{purgeTarget.slug}</p>
              <p className="mt-1.5">
                {purgeTarget.ordersTotal} despachos históricos · purga programada{' '}
                {formatDatePen(purgeTarget.purgeAt)}
              </p>
            </div>

            <form onSubmit={purgeTenant} className="space-y-3 text-xs">
              <div className="form-group">
                <label className="form-label font-bold text-slate-700">
                  Escribe el identificador para confirmar
                </label>
                <input
                  value={purgeConfirm}
                  onChange={(event) => setPurgeConfirm(event.target.value)}
                  className="form-input font-mono"
                  placeholder={purgeTarget.slug}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPurgeTarget(null);
                    setPurgeConfirm('');
                  }}
                  className="px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPurging || purgeConfirm !== purgeTarget.slug}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 font-bold text-white disabled:opacity-50"
                >
                  {isPurging ? <Loader2 size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
                  Eliminar definitivamente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
