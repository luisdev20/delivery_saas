'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Bell, Package, Truck, CheckCircle, Clock, XCircle,
  ChefHat, MapPin, Phone, User, CreditCard, MessageSquare,
  LogOut, Menu, UtensilsCrossed, BarChart2, X, Users,
  ShoppingBag, Timer, ArrowRight, Plus, Pencil, Trash2, Save, Loader2,
} from 'lucide-react';
import type { Order, Driver, Restaurant, OrderStatus, Product } from '@/lib/supabase/types';

interface Props {
  restaurant: Restaurant;
  drivers: Driver[];
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; next: OrderStatus | null }> = {
  RECIBIDO:       { label: 'Recibido',       icon: <Bell size={14} />,        next: 'EN_PREPARACION' },
  EN_PREPARACION: { label: 'En preparación', icon: <ChefHat size={14} />,     next: 'LISTO' },
  LISTO:          { label: 'Listo',           icon: <Package size={14} />,     next: 'EN_CAMINO' },
  EN_CAMINO:      { label: 'En camino',       icon: <Truck size={14} />,       next: 'ENTREGADO' },
  ENTREGADO:      { label: 'Entregado',       icon: <CheckCircle size={14} />, next: null },
  CANCELADO:      { label: 'Cancelado',       icon: <XCircle size={14} />,     next: null },
};

const STATUS_NEXT_LABEL: Record<OrderStatus, string> = {
  RECIBIDO:       'Iniciar preparación',
  EN_PREPARACION: 'Marcar listo',
  LISTO:          'Asignar y enviar',
  EN_CAMINO:      'Confirmar entrega',
  ENTREGADO:      '',
  CANCELADO:      '',
};

type AdminTab = 'dashboard' | 'fleet' | 'kitchen' | 'menu';
type FilterTab = 'active' | 'delivered' | 'all';

const DAYS = [
  { num: 1, label: 'L' },
  { num: 2, label: 'M' },
  { num: 3, label: 'X' },
  { num: 4, label: 'J' },
  { num: 5, label: 'V' },
  { num: 6, label: 'S' },
  { num: 7, label: 'D' },
];

const CATEGORIES = ['Menú del Día', 'A la Carta', 'Bebidas', 'Postres', 'Entradas', 'Promociones'];

const emptyProductForm = (): Partial<Product> => ({
  name: '',
  description: '',
  category: 'A la Carta',
  price: 0,
  is_available: true,
  available_days: [1, 2, 3, 4, 5, 6, 7],
});

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `Hace ${diff} min`;
  return `Hace ${Math.floor(diff / 60)}h`;
}

export default function AdminDashboardClient({ restaurant, drivers: initialDrivers }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trackingDrawerOrder, setTrackingDrawerOrder] = useState<Order | null>(null);

  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant>(restaurant);
  const [togglingOpen, setTogglingOpen] = useState(false);

  // Driver modal
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [savingDriver, setSavingDriver] = useState(false);

  // Product modal
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  const trackingMapRef = useRef<HTMLDivElement>(null);
  const trackingLeafletRef = useRef<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = createClient();

  const toggleStoreStatus = async () => {
    const newStatus = !currentRestaurant.is_open;
    setTogglingOpen(true);
    setCurrentRestaurant(prev => ({ ...prev, is_open: newStatus }));
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ is_open: newStatus })
        .eq('id', restaurant.id);
      if (error) throw error;
      toast.success(newStatus ? 'Restaurante ABIERTO: Recibiendo nuevos pedidos' : 'Restaurante CERRADO: Pedidos en línea pausados');
    } catch {
      setCurrentRestaurant(prev => ({ ...prev, is_open: !newStatus }));
      toast.error('Error al actualizar el estado del restaurante');
    } finally {
      setTogglingOpen(false);
    }
  };

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, driver:drivers(*), order_items(*)')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setOrders(data as Order[]);
  }, [restaurant.id, supabase]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (data) setProducts(data as Product[]);
  }, [restaurant.id, supabase]);

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('restaurant_id', restaurant.id);
    if (data) setDrivers(data as Driver[]);
  }, [restaurant.id, supabase]);

  useEffect(() => {
    loadOrders();
    loadProducts();
    loadDrivers();
  }, [loadOrders, loadProducts, loadDrivers]);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurant.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: newOrder } = await supabase
            .from('orders')
            .select('*, driver:drivers(*), order_items(*)')
            .eq('id', payload.new.id)
            .single();
          if (newOrder) {
            setOrders(prev => [newOrder as Order, ...prev]);
            try {
              audioRef.current = new Audio('/sounds/new-order.mp3');
              audioRef.current.play().catch(() => {});
            } catch {}
            toast.success(`Nuevo pedido de ${payload.new.customer_name}`, { duration: 8000 });
          }
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
          if (selectedOrder?.id === payload.new.id) {
            setSelectedOrder(prev => prev ? { ...prev, ...payload.new } : null);
          }
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant.id, selectedOrder?.id, supabase]);

  /* Tracking drawer map */
  useEffect(() => {
    if (!trackingDrawerOrder || !trackingMapRef.current) return;
    let isMounted = true;

    if (trackingLeafletRef.current) {
      (trackingLeafletRef.current as { remove: () => void }).remove();
      trackingLeafletRef.current = null;
    }

    if (!trackingDrawerOrder.delivery_lat || !trackingDrawerOrder.delivery_lng) return;

    import('leaflet').then(L => {
      if (!isMounted || !trackingMapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(trackingMapRef.current!).setView(
        [trackingDrawerOrder.delivery_lat, trackingDrawerOrder.delivery_lng], 14
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        html: `<div style="width:28px;height:28px;background:${restaurant.brand_color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28], className: '',
      });
      L.marker([trackingDrawerOrder.delivery_lat, trackingDrawerOrder.delivery_lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${trackingDrawerOrder.customer_name}</b><br>${trackingDrawerOrder.delivery_address}`);
      trackingLeafletRef.current = map;
    });

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    return () => { isMounted = false; };
  }, [trackingDrawerOrder, restaurant.brand_color]);

  const advanceStatus = async (order: Order) => {
    const next = STATUS_CONFIG[order.status].next;
    if (!next) return;
    if (next === 'EN_CAMINO' && !order.driver_id && drivers.length > 0) {
      toast.error('Asigne un repartidor antes de enviar');
      return;
    }
    setUpdatingId(order.id);
    const updates: Partial<Order> = { status: next };
    if (next === 'ENTREGADO') updates.delivered_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id);
    if (error) toast.error('Error al actualizar el estado');
    else toast.success(`Orden #${order.order_number} -> ${STATUS_CONFIG[next].label}`);
    setUpdatingId(null);
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    const { error } = await supabase.from('orders').update({ driver_id: driverId }).eq('id', orderId);
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, driver_id: driverId } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, driver_id: driverId } : null);
      }
      toast.success('Repartidor asignado');
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm('¿Desea cancelar esta orden?')) return;
    await supabase.from('orders').update({ status: 'CANCELADO' }).eq('id', orderId);
    toast.error('Orden cancelada');
  };

  const sendTrackingLink = (order: Order) => {
    const url = `${window.location.origin}/tracking/${order.id}`;
    const msg = encodeURIComponent(
      `Hola ${order.customer_name}.\nSu pedido de ${restaurant.name} está en camino.\n\nSeguimiento en vivo:\n${url}`
    );
    const phone = order.customer_phone.replace(/\D/g, '');
    window.open(`https://wa.me/51${phone}?text=${msg}`, '_blank');
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName || !newDriverPhone) {
      toast.error('Nombre y teléfono son obligatorios');
      return;
    }
    setSavingDriver(true);
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        restaurant_id: restaurant.id,
        name: newDriverName,
        phone: newDriverPhone,
        is_active: true,
      })
      .select()
      .single();

    if (!error && data) {
      setDrivers(prev => [...prev, data as Driver]);
      toast.success(`Repartidor ${data.name} registrado`);
      setShowDriverModal(false);
      setNewDriverName('');
      setNewDriverPhone('');
    } else {
      toast.error('Error al registrar repartidor');
    }
    setSavingDriver(false);
  };

  const handleToggleDriver = async (driver: Driver) => {
    const newVal = !driver.is_active;
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: newVal })
      .eq('id', driver.id);
    if (!error) {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, is_active: newVal } : d));
      toast.success(newVal ? `${driver.name} activado` : `${driver.name} desactivado`);
    }
  };

  const toggleProductAvailability = async (product: Product) => {
    const newVal = !product.is_available;
    const { error } = await supabase
      .from('products')
      .update({ is_available: newVal })
      .eq('id', product.id);
    if (!error) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: newVal } : p));
      toast.success(newVal ? `"${product.name}" activado` : `"${product.name}" marcado como agotado`);
    }
  };

  const handleSaveProduct = async () => {
    if (!editingProduct?.name || !editingProduct.price) {
      toast.error('Nombre y precio son obligatorios');
      return;
    }
    setSavingProduct(true);
    const payload = {
      restaurant_id: restaurant.id,
      name: editingProduct.name,
      description: editingProduct.description || null,
      category: editingProduct.category || 'A la Carta',
      price: Number(editingProduct.price),
      is_available: editingProduct.is_available ?? true,
      available_days: editingProduct.available_days || [1, 2, 3, 4, 5, 6, 7],
    };

    if (isNewProduct) {
      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (!error && data) {
        setProducts(prev => [...prev, data as Product]);
        toast.success(`"${data.name}" creado`);
        setEditingProduct(null);
      } else {
        toast.error('Error al crear el producto');
      }
    } else if (editingProduct.id) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id)
        .select()
        .single();
      if (!error && data) {
        setProducts(prev => prev.map(p => p.id === data.id ? data as Product : p));
        toast.success(`"${data.name}" actualizado`);
        setEditingProduct(null);
      } else {
        toast.error('Error al guardar');
      }
    }
    setSavingProduct(false);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== product.id));
      toast.success(`"${product.name}" eliminado`);
    }
  };

  const filteredOrders = orders.filter(o => {
    if (activeFilter === 'active') return !['ENTREGADO', 'CANCELADO'].includes(o.status);
    if (activeFilter === 'delivered') return o.status === 'ENTREGADO';
    return true;
  });

  const activeCount  = orders.filter(o => !['ENTREGADO', 'CANCELADO'].includes(o.status)).length;
  const enRutaCount  = orders.filter(o => o.status === 'EN_CAMINO').length;
  const todayCount   = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length;

  /* KDS buckets */
  const kdsNuevos = orders.filter(o => o.status === 'RECIBIDO');
  const kdsPrep   = orders.filter(o => o.status === 'EN_PREPARACION');
  const kdsListos = orders.filter(o => o.status === 'LISTO');

  const groupedProducts = useMemo(() => {
    return products.reduce<Record<string, Product[]>>((acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    }, {});
  }, [products]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const sidebarNavItems = [
    { id: 'dashboard', icon: <BarChart2 size={18} />, label: 'Dashboard', badge: activeCount },
    { id: 'fleet',     icon: <Users size={18} />,     label: 'Gestión de Flota', badge: drivers.filter(d => d.is_active).length },
    { id: 'kitchen',   icon: <ChefHat size={18} />,   label: 'Monitor Cocina (KDS)', badge: kdsNuevos.length + kdsPrep.length },
    { id: 'menu',      icon: <UtensilsCrossed size={18} />, label: 'Menú del Restaurante' },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9', fontFamily: 'Inter, sans-serif' }}>

      {/* ================= SIDEBAR (SaaS Indigo) ================= */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-indigo-950 text-white flex flex-col shadow-xl transition-transform duration-300
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ background: 'var(--saas-900)' }}>

        {/* Brand Header */}
        <div className="p-6 border-b border-indigo-800/60 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--saas-600)' }}>
            <ShoppingBag size={18} color="white" />
          </div>
          <div className="overflow-hidden">
            <h1 className="font-bold text-sm text-white tracking-wide truncate">Delivery Tracker</h1>
            <p className="text-xs text-indigo-300 truncate">{restaurant.name}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {sidebarNavItems.map(item => {
            const isActive = adminTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setAdminTab(item.id as AdminTab); setSelectedOrder(null); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-indigo-200 hover:bg-indigo-900/60 hover:text-white'
                }`}
                id={`tab-btn-${item.id}`}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white bg-indigo-500/80">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Store Status Toggle */}
        <div className="p-4 border-t border-indigo-800/60 bg-indigo-950/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-300">
              Estado del Restaurante
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${currentRestaurant.is_open ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-red-500/20 text-red-300 border border-red-400/40'}`}>
              {currentRestaurant.is_open ? 'ABIERTO' : 'CERRADO'}
            </span>
          </div>
          <button
            onClick={toggleStoreStatus}
            disabled={togglingOpen}
            className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${currentRestaurant.is_open ? 'bg-red-600/90 hover:bg-red-700 text-white shadow-xs' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'}`}
            id="btn-toggle-store"
          >
            {togglingOpen ? (
              <Loader2 size={14} className="animate-spin" />
            ) : currentRestaurant.is_open ? (
              <>Cerrar Restaurante (Pausar)</>
            ) : (
              <>Abrir Restaurante (Recibir)</>
            )}
          </button>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-indigo-800/60">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 hover:bg-red-900/40 text-indigo-300 hover:text-red-300 rounded-lg text-sm transition-colors border border-indigo-800/80"
          >
            <LogOut size={16} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ================= MAIN CONTENT AREA ================= */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">

        {/* Mobile Topbar */}
        <header className="flex items-center justify-between px-6 py-3 border-b bg-white md:hidden shrink-0" style={{ borderColor: 'var(--border-color)' }}>
          <button onClick={() => setSidebarOpen(s => !s)} className="btn btn-ghost btn-sm">
            <Menu size={20} />
          </button>
          <span className="font-bold text-sm text-slate-800">{restaurant.name}</span>
          <button
            onClick={toggleStoreStatus}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${currentRestaurant.is_open ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
          >
            <div className={`w-2 h-2 rounded-full ${currentRestaurant.is_open ? 'bg-emerald-500 pulse-dot' : 'bg-red-500'}`} />
            {currentRestaurant.is_open ? 'Abierto' : 'Cerrado'}
          </button>
        </header>

        {/* ================= TAB 1: DASHBOARD (DESPACHOS) ================= */}
        {adminTab === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            {/* Header */}
            <header className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Monitor de Despachos</h2>
                <p className="text-slate-500 text-sm mt-0.5">Control operativo en tiempo real</p>
              </div>
              <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
                Sincronización en vivo
              </div>
            </header>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Envíos Hoy</p>
                  <p className="text-2xl font-bold text-slate-800">{todayCount}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                  <Truck size={24} />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">En Ruta</p>
                  <p className="text-2xl font-bold text-slate-800">{enRutaCount}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                  <Timer size={24} />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium">Activos</p>
                  <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
                </div>
              </div>
            </div>

            {/* Orders Table Container */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
              {/* Filter Tabs */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
                <div className="flex gap-2">
                  {([['active', 'Activas', activeCount], ['delivered', 'Entregadas', null], ['all', 'Todas', null]] as const).map(([tab, label, count]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFilter(tab)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeFilter === tab
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {label} {count !== null && count > 0 ? `(${count})` : ''}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  Mostrando {filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-semibold">ID Pedido</th>
                      <th className="p-4 font-semibold">Cliente</th>
                      <th className="p-4 font-semibold">Repartidor</th>
                      <th className="p-4 font-semibold">Total / Pago</th>
                      <th className="p-4 font-semibold">Estado</th>
                      <th className="p-4 font-semibold text-right">Acción Operativa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-16 text-slate-400">
                          {activeFilter === 'active' ? 'No hay órdenes activas en este momento' : 'No hay órdenes en esta vista'}
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <td className="p-4 font-bold text-slate-800">
                            #{order.order_number}
                            <span className="block text-[11px] font-normal text-slate-400 mt-0.5">{timeAgo(order.created_at)}</span>
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-slate-800 block">{order.customer_name}</span>
                            <span className="text-xs text-slate-400">{order.customer_phone}</span>
                          </td>
                          <td className="p-4 text-slate-600">
                            {order.driver ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                <Truck size={13} className="text-indigo-600" /> {(order.driver as Driver).name}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sin asignar</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            S/ {order.total_amount.toFixed(2)}
                            <span className="block text-[11px] font-normal text-slate-400">{order.payment_method}</span>
                          </td>
                          <td className="p-4">
                            <span className={`badge badge-${order.status}`}>
                              {STATUS_CONFIG[order.status].icon}
                              {STATUS_CONFIG[order.status].label}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                              {['EN_CAMINO', 'LISTO'].includes(order.status) && (
                                <button
                                  onClick={() => setTrackingDrawerOrder(order)}
                                  className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 text-xs"
                                  id={`track-${order.order_number}`}
                                >
                                  <MapPin size={13} /> Rastrear
                                </button>
                              )}
                              {STATUS_CONFIG[order.status].next && (
                                <button
                                  onClick={() => advanceStatus(order)}
                                  disabled={updatingId === order.id}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded font-semibold transition-colors text-xs flex items-center gap-1"
                                >
                                  {updatingId === order.id ? '...' : STATUS_NEXT_LABEL[order.status]}
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded text-xs font-semibold"
                              >
                                Ver
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: FLEET (GESTIÓN DE FLOTA) ================= */}
        {adminTab === 'fleet' && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            <header className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Gestión de Flota</h2>
                <p className="text-slate-500 text-sm mt-0.5">Control de repartidores y accesos a la App Móvil</p>
              </div>
              <button
                onClick={() => setShowDriverModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors"
                id="btn-new-driver"
              >
                <Plus size={16} /> Nuevo Repartidor
              </button>
            </header>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-semibold">Repartidor</th>
                    <th className="p-4 font-semibold">Contacto (WhatsApp)</th>
                    <th className="p-4 font-semibold">Fecha Registro</th>
                    <th className="p-4 font-semibold">Estado</th>
                    <th className="p-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400">
                        No hay repartidores registrados. Agregue el primero haciendo clic en &ldquo;Nuevo Repartidor&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    drivers.map(driver => (
                      <tr key={driver.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">
                          {driver.name}
                        </td>
                        <td className="p-4">
                          <a
                            href={`https://wa.me/51${driver.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:underline font-medium flex items-center gap-1.5"
                          >
                            <Phone size={14} /> {driver.phone}
                          </a>
                        </td>
                        <td className="p-4 text-slate-500 text-xs">
                          {new Date(driver.created_at).toLocaleDateString('es-PE')}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            driver.is_active
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {driver.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleToggleDriver(driver)}
                            className="text-xs font-semibold px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            {driver.is_active ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 3: KITCHEN (MONITOR COCINA - KDS) ================= */}
        {adminTab === 'kitchen' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
            <header className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Monitor de Cocina (KDS)</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {kdsNuevos.length} nuevos &middot; {kdsPrep.length} en preparación &middot; {kdsListos.length} listos
                </p>
              </div>
            </header>

            {/* Kanban Grid */}
            <div className="flex-1 p-8 flex gap-6 overflow-x-auto min-h-0">
              {/* Columna 1: Nuevos */}
              <div className="w-[320px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                  <span>1. Nuevos (Pagados)</span>
                  <span className="bg-slate-200 text-slate-700 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {kdsNuevos.length}
                  </span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto space-y-4">
                  {kdsNuevos.length === 0 && (
                    <p className="text-xs text-center text-slate-400 py-12">Sin pedidos nuevos</p>
                  )}
                  {kdsNuevos.map(order => (
                    <div key={order.id} className="bg-white border-2 border-slate-200 rounded-lg p-4 shadow-sm animate-fade-in">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-lg text-slate-800">#{order.order_number}</span>
                        <span className="text-xs font-bold text-slate-500">{timeAgo(order.created_at)}</span>
                      </div>
                      {order.order_items && (
                        <ul className="text-sm text-slate-600 mb-4 list-disc pl-4 space-y-1 font-medium">
                          {order.order_items.map(i => (
                            <li key={i.id}>{i.quantity}x {i.product_name}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => advanceStatus(order)}
                          disabled={updatingId === order.id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded text-xs transition-colors"
                        >
                          {updatingId === order.id ? '...' : 'Preparar'}
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="px-3 bg-red-100 hover:bg-red-200 text-red-600 font-bold py-2 rounded text-xs transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna 2: En Preparación */}
              <div className="w-[320px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                <div className="bg-blue-50 p-4 border-b border-blue-100 font-bold text-blue-800 flex justify-between items-center">
                  <span>2. En Preparación</span>
                  <span className="bg-blue-200 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {kdsPrep.length}
                  </span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto bg-blue-50/20 space-y-4">
                  {kdsPrep.length === 0 && (
                    <p className="text-xs text-center text-slate-400 py-12">Vacío</p>
                  )}
                  {kdsPrep.map(order => (
                    <div key={order.id} className="bg-white border-2 border-blue-200 rounded-lg p-4 shadow-sm animate-fade-in">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-lg text-slate-800">#{order.order_number}</span>
                        <span className="text-xs font-bold text-amber-600">{timeAgo(order.created_at)}</span>
                      </div>
                      {order.order_items && (
                        <ul className="text-sm text-slate-600 mb-4 list-disc pl-4 space-y-1 font-medium">
                          {order.order_items.map(i => (
                            <li key={i.id}>{i.quantity}x {i.product_name}</li>
                          ))}
                        </ul>
                      )}
                      <button
                        onClick={() => advanceStatus(order)}
                        disabled={updatingId === order.id}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded text-xs transition-colors shadow-sm"
                      >
                        {updatingId === order.id ? '...' : 'Marcar como Listo'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna 3: Listos */}
              <div className="w-[320px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
                <div className="bg-emerald-50 p-4 border-b border-emerald-100 font-bold text-emerald-800 flex justify-between items-center">
                  <span>3. Listos (Bolsa de Entrega)</span>
                  <span className="bg-emerald-200 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                    {kdsListos.length}
                  </span>
                </div>
                <div className="p-4 flex-1 overflow-y-auto bg-emerald-50/20 space-y-4">
                  {kdsListos.length === 0 && (
                    <p className="text-xs text-center text-slate-400 py-12">Vacío</p>
                  )}
                  {kdsListos.map(order => (
                    <div key={order.id} className="bg-white border-2 border-emerald-200 rounded-lg p-4 shadow-sm animate-fade-in">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-black text-lg text-slate-800">#{order.order_number}</span>
                        <span className="text-xs font-bold text-emerald-600">{timeAgo(order.created_at)}</span>
                      </div>
                      {order.order_items && (
                        <ul className="text-sm text-slate-600 mb-4 list-disc pl-4 space-y-1 font-medium">
                          {order.order_items.map(i => (
                            <li key={i.id}>{i.quantity}x {i.product_name}</li>
                          ))}
                        </ul>
                      )}
                      <div className="text-xs font-bold py-2 rounded text-center flex items-center justify-center gap-1.5 uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
                        Esperando Repartidor
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: MENU (GESTIÓN DE MENÚ) ================= */}
        {adminTab === 'menu' && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            <header className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Gestión de Menú</h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  {products.length} {products.length === 1 ? 'plato registrado' : 'platos registrados'} en la carta
                </p>
              </div>
              <button
                onClick={() => { setEditingProduct(emptyProductForm()); setIsNewProduct(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors"
                id="btn-new-product"
              >
                <Plus size={16} /> Nuevo Plato
              </button>
            </header>

            {Object.keys(groupedProducts).length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
                <p className="font-semibold text-slate-700">No hay productos en el menú</p>
                <p className="text-sm text-slate-400 mt-1 mb-4">Agregue su primer plato para empezar a vender</p>
                <button
                  onClick={() => { setEditingProduct(emptyProductForm()); setIsNewProduct(true); }}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  <Plus size={16} className="inline mr-1" /> Agregar primer plato
                </button>
              </div>
            ) : (
              Object.entries(groupedProducts).map(([category, items]) => (
                <section key={category} className="mb-8">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                    {category} <span className="font-normal text-slate-400">({items.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map(product => (
                      <div
                        key={product.id}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
                        style={{ opacity: product.is_available ? 1 : 0.6 }}
                      >
                        <label className="toggle flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={product.is_available}
                            onChange={() => toggleProductAvailability(product)}
                          />
                          <span className="toggle-slider" />
                        </label>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-800 truncate">{product.name}</h4>
                            {!product.is_available && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-500">
                                Agotado
                              </span>
                            )}
                          </div>
                          {product.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{product.description}</p>
                          )}
                          <div className="flex gap-1 mt-2">
                            {DAYS.map(d => (
                              <span
                                key={d.num}
                                className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-bold ${
                                  product.available_days?.includes(d.num)
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-100 text-slate-300'
                                }`}
                              >
                                {d.label}
                              </span>
                            ))}
                          </div>
                        </div>

                        <span className="font-black text-sm text-slate-800 flex-shrink-0">
                          S/ {product.price.toFixed(2)}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingProduct(product); setIsNewProduct(false); }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="p-1.5 text-red-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

      </main>

      {/* ================= ORDER DETAIL DRAWER ================= */}
      {selectedOrder && (
        <>
          <div className="drawer-overlay" onClick={() => setSelectedOrder(null)} />
          <div className="drawer-panel animate-slide-in">
            <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <h3 className="font-bold text-xl text-slate-800">Orden #{selectedOrder.order_number}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(selectedOrder.created_at).toLocaleString('es-PE')}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {/* Status Action */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`badge badge-${selectedOrder.status} text-xs px-3 py-1`}>
                    {STATUS_CONFIG[selectedOrder.status].icon}
                    {STATUS_CONFIG[selectedOrder.status].label}
                  </span>
                  <span className="font-bold text-slate-800 text-sm">S/ {selectedOrder.total_amount.toFixed(2)}</span>
                </div>

                {STATUS_CONFIG[selectedOrder.status].next && (
                  <button
                    onClick={() => advanceStatus(selectedOrder)}
                    disabled={updatingId === selectedOrder.id}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {updatingId === selectedOrder.id ? 'Actualizando...' : <><ArrowRight size={16} /> {STATUS_NEXT_LABEL[selectedOrder.status]}</>}
                  </button>
                )}

                {selectedOrder.status === 'EN_CAMINO' && (
                  <button
                    onClick={() => sendTrackingLink(selectedOrder)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <MessageSquare size={16} /> Enviar tracking por WhatsApp
                  </button>
                )}
              </div>

              {/* Assign Driver */}
              {!['ENTREGADO', 'CANCELADO'].includes(selectedOrder.status) && (
                <div className="space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Asignar Repartidor</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {drivers.map(d => (
                      <button
                        key={d.id}
                        onClick={() => assignDriver(selectedOrder.id, d.id)}
                        className={`p-3 rounded-lg border text-left transition-all flex justify-between items-center ${
                          selectedOrder.driver_id === d.id
                            ? 'border-indigo-600 bg-indigo-50 font-semibold'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-sm text-slate-800">{d.name}</p>
                          <p className="text-xs text-slate-400">{d.phone}</p>
                        </div>
                        {selectedOrder.driver_id === d.id && (
                          <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded font-bold">Asignado</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer Info */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Datos del Cliente</h4>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><User size={15} className="text-slate-400" /> {selectedOrder.customer_name}</div>
                  <div className="flex items-center gap-2"><Phone size={15} className="text-slate-400" /> {selectedOrder.customer_phone}</div>
                  <div className="flex items-start gap-2"><MapPin size={15} className="text-slate-400 mt-0.5" /> {selectedOrder.delivery_address}</div>
                  {selectedOrder.delivery_reference && (
                    <div className="text-xs text-slate-500 pl-6">Ref: {selectedOrder.delivery_reference}</div>
                  )}
                  <div className="flex items-center gap-2"><CreditCard size={15} className="text-slate-400" /> Pago: {selectedOrder.payment_method}</div>
                </div>
              </div>

              {/* Order Items */}
              {selectedOrder.order_items && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Detalle del Pedido</h4>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 divide-y divide-slate-200 text-sm">
                    {selectedOrder.order_items.map(item => (
                      <div key={item.id} className="py-2 flex justify-between first:pt-0 last:pb-0">
                        <span>{item.quantity}x {item.product_name}</span>
                        <span className="font-semibold text-slate-800">S/ {(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="pt-3 flex justify-between font-bold text-base text-slate-900">
                      <span>Total</span>
                      <span className="text-indigo-600">S/ {selectedOrder.total_amount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= TRACKING DRAWER (MAP) ================= */}
      {trackingDrawerOrder && (
        <>
          <div className="drawer-overlay" onClick={() => setTrackingDrawerOrder(null)} />
          <div className="drawer-panel animate-slide-in">
            <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Rastreo #{trackingDrawerOrder.order_number}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{trackingDrawerOrder.customer_name}</p>
              </div>
              <button onClick={() => setTrackingDrawerOrder(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div ref={trackingMapRef} className="w-full" style={{ height: '260px' }} id="drawer-tracking-map" />

            <div className="p-6 space-y-6">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Bitácora Operativa</h4>
              <div className="relative pl-6 space-y-6 border-l-2 border-slate-200">
                {['RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO'].map(s => {
                  const statuses = ['RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO'];
                  const currentIdx = statuses.indexOf(trackingDrawerOrder.status);
                  const stepIdx = statuses.indexOf(s);
                  const done = stepIdx <= currentIdx;
                  return (
                    <div key={s} className="relative">
                      <div
                        className={`absolute -left-[31px] w-3.5 h-3.5 rounded-full border-2 border-white ${
                          done ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      />
                      <p className="text-xs text-slate-400">{STATUS_CONFIG[s as OrderStatus].label}</p>
                      <p className={`text-sm font-semibold ${done ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {done ? (s === trackingDrawerOrder.status ? 'Estado actual' : 'Completado') : 'Pendiente'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {trackingDrawerOrder.status === 'EN_CAMINO' && (
                <button
                  onClick={() => sendTrackingLink(trackingDrawerOrder)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageSquare size={15} /> Enviar tracking por WhatsApp
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= MODAL: NUEVO REPARTIDOR ================= */}
      {showDriverModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">Registrar Repartidor</h3>
              <button onClick={() => setShowDriverModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateDriver} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input
                  className="form-input"
                  placeholder="Ej. Carlos Rodríguez"
                  value={newDriverName}
                  onChange={e => setNewDriverName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp / Teléfono</label>
                <input
                  className="form-input"
                  type="tel"
                  placeholder="Ej. 987654321"
                  value={newDriverPhone}
                  onChange={e => setNewDriverPhone(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDriver}
                  className="btn btn-indigo flex-1"
                >
                  {savingDriver ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDITAR / NUEVO PLATO ================= */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">
                {isNewProduct ? 'Nuevo Plato' : 'Editar Plato'}
              </h3>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="form-label">Nombre del plato *</label>
                <input
                  className="form-input"
                  value={editingProduct.name || ''}
                  onChange={e => setEditingProduct(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej. Lomo Saltado Criollo"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={editingProduct.description || ''}
                  onChange={e => setEditingProduct(p => ({ ...p, description: e.target.value }))}
                  placeholder="Ingredientes o descripción breve"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select
                    className="form-input form-select"
                    value={editingProduct.category || 'A la Carta'}
                    onChange={e => setEditingProduct(p => ({ ...p, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Precio (S/) *</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.10"
                    min="0"
                    value={editingProduct.price || ''}
                    onChange={e => setEditingProduct(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    placeholder="35.90"
                  />
                </div>
              </div>

              <div>
                <label className="form-label mb-2 block">Días de disponibilidad</label>
                <div className="flex gap-2">
                  {DAYS.map(d => {
                    const isSelected = editingProduct.available_days?.includes(d.num);
                    return (
                      <button
                        key={d.num}
                        type="button"
                        onClick={() => {
                          const current = editingProduct.available_days || [];
                          const updated = current.includes(d.num)
                            ? current.filter(x => x !== d.num)
                            : [...current, d.num].sort();
                          setEditingProduct(p => ({ ...p, available_days: updated }));
                        }}
                        className={`w-9 h-9 rounded-lg font-bold text-xs transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingProduct}
                  onClick={handleSaveProduct}
                  className="btn btn-indigo flex-1"
                >
                  {savingProduct ? 'Guardando...' : <><Save size={16} /> Guardar Plato</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
