'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Bell, Package, Truck, CheckCircle, XCircle,
  MapPin, Phone, User, CreditCard, MessageSquare,
  LogOut, Menu, BarChart2, X, Users, Store,
  Timer, ArrowRight, Plus, Trash2, Loader2,
  TrendingUp, DollarSign, Target, Key, Code, Copy, Check,
  ShieldCheck, AlertTriangle, Boxes, PackageCheck,
  PlusCircle, Search, RotateCcw,
  Receipt, Settings,
} from 'lucide-react';
import type {
  Order, Driver, Restaurant, OrderStatus, Subscription,
  MerchantApiKey, CancellationReason,
} from '@/lib/supabase/types';
import { CANCELLATION_REASONS } from '@/lib/supabase/types';
import {
  getSubscriptionSnapshot,
  type BillingTransaction,
  type SubscriptionSnapshot,
} from '@/lib/subscription';
import PlanBadge from '@/components/admin/PlanBadge';
import SubscriptionBanner from '@/components/admin/SubscriptionBanner';
import OrderQuotaWidget from '@/components/admin/OrderQuotaWidget';
import BillingPanel from '@/components/admin/BillingPanel';
import BusinessSettingsPanel from '@/components/admin/BusinessSettingsPanel';
import OperationalAccountsPanel from '@/components/admin/OperationalAccountsPanel';

interface Props {
  restaurant: Restaurant;
  allRestaurants?: Restaurant[];
  drivers: Driver[];
  subscription: Subscription | null;
  lastTransaction: BillingTransaction | null;
  billingTransactions: BillingTransaction[];
  initialOrders?: Order[];
  userRole: string;
  userEmail?: string | null;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: React.ReactNode; next: OrderStatus | null }> = {
  RECIBIDO:       { label: 'Recibido',        icon: <Bell size={14} />,         next: 'EN_PREPARACION' },
  EN_PREPARACION: { label: 'En preparación',  icon: <Boxes size={14} />,        next: 'LISTO' },
  LISTO:          { label: 'Listo p/ entrega',icon: <PackageCheck size={14} />, next: 'EN_CAMINO' },
  EN_CAMINO:      { label: 'En camino',       icon: <Truck size={14} />,        next: 'ENTREGADO' },
  ENTREGADO:      { label: 'Entregado',       icon: <CheckCircle size={14} />,  next: null },
  CANCELADO:      { label: 'Cancelado',       icon: <XCircle size={14} />,      next: null },
};

const STATUS_NEXT_LABEL: Record<OrderStatus, string> = {
  RECIBIDO:       'Iniciar preparación',
  EN_PREPARACION: 'Marcar listo p/ despacho',
  LISTO:          'Despachar (En camino)',
  EN_CAMINO:      'Validar PIN y entregar',
  ENTREGADO:      '',
  CANCELADO:      '',
};

type AdminTab = 'dashboard' | 'fleet' | 'api_keys' | 'metrics' | 'billing' | 'settings';
type FilterTab = 'active' | 'delivered' | 'all';
type MetricsRange = 'today' | '7days' | 'month' | 'last_month';
type CodeTab = 'curl' | 'js' | 'python';

interface SidebarNavItem {
  id: AdminTab;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `Hace ${diff} min`;
  return `Hace ${Math.floor(diff / 60)}h`;
}

export default function AdminDashboardClient({
  restaurant,
  allRestaurants = [],
  drivers: initialDrivers,
  subscription: initialSubscription,
  lastTransaction: initialLastTransaction,
  billingTransactions: initialBillingTransactions,
  initialOrders = [],
  userRole,
  userEmail,
}: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [apiKeys, setApiKeys] = useState<MerchantApiKey[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('active');
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trackingDrawerOrder, setTrackingDrawerOrder] = useState<Order | null>(null);

  // Suscripción y facturación
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(
    initialSubscription
  );
  const [lastTransaction, setLastTransaction] = useState<BillingTransaction | null>(
    initialLastTransaction
  );
  const [billingHistory, setBillingHistory] = useState<BillingTransaction[]>(
    initialBillingTransactions
  );

  // Logistics Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDriver, setFilterDriver] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterOrigin, setFilterOrigin] = useState('all');
  const [filterDate, setFilterDate] = useState('all');

  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant>(restaurant);
  const [togglingOpen, setTogglingOpen] = useState(false);

  // Estado contractual derivado (sidebar, guard global y cuota)
  const snapshot: SubscriptionSnapshot = useMemo(
    () => getSubscriptionSnapshot(currentSubscription, lastTransaction),
    [currentSubscription, lastTransaction]
  );
  const activeDriverCount = useMemo(
    () => drivers.filter((driver) => driver.is_active && !driver.deleted_at).length,
    [drivers]
  );
  const readOnly = snapshot.readOnly;
  const canCreateOrders = !snapshot.readOnly && !snapshot.quotaReached;

  const handleDriversChanged = useCallback((nextDrivers: Driver[]) => {
    setDrivers(nextDrivers);
  }, []);

  const handleSubscriptionUpdated = useCallback(
    (nextSubscription: Subscription, transaction: BillingTransaction) => {
      setCurrentSubscription(nextSubscription);
      setLastTransaction(transaction);
      setBillingHistory((prev) => [transaction, ...prev]);
    },
    []
  );

  const refreshSubscription = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/subscription?tenantId=${encodeURIComponent(restaurant.id)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data.subscription) setCurrentSubscription(data.subscription as Subscription);
      if (data.transactions?.length) {
        setBillingHistory(data.transactions as BillingTransaction[]);
        setLastTransaction(data.transactions[0] as BillingTransaction);
      }
    } catch {
      // La UI conserva el último estado conocido; no se bloquea al usuario.
    }
  }, [restaurant.id]);

  // Manual Dispatch Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    delivery_reference: '',
    item_description: '',
    total_amount: '',
    notes: '',
  });
  const [creatingManual, setCreatingManual] = useState(false);

  // PIN Validation Modal
  const [pinModalOrder, setPinModalOrder] = useState<Order | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [validatingPin, setValidatingPin] = useState(false);

  // Cancellation Modal
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<CancellationReason>('QUIEBRE_STOCK');
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // API Key creation & display modal
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [rawKeyDisplay, setRawKeyDisplay] = useState<{ rawKey: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>('curl');

  // Metrics
  const [metricsRange, setMetricsRange] = useState<MetricsRange>('today');
  const [metricsOrders, setMetricsOrders] = useState<Order[]>([]);
  const [driverHistoryOrders, setDriverHistoryOrders] = useState<Order[]>([]);
  const [driverView, setDriverView] = useState<'total' | 'daily'>('total');

  const trackingMapRef = useRef<HTMLDivElement>(null);
  const trackingLeafletRef = useRef<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const toggleStoreStatus = async () => {
    const newStatus = !currentRestaurant.is_open;
    setTogglingOpen(true);
    setCurrentRestaurant(prev => ({ ...prev, is_open: newStatus }));
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ is_open: newStatus })
        .eq('id', restaurant.id);
      if (error) throw error;
      toast.success(newStatus ? 'Comercio ABIERTO: Recibiendo requerimientos de despacho' : 'Comercio CERRADO: Despachos pausados');
    } catch {
      setCurrentRestaurant(prev => ({ ...prev, is_open: !newStatus }));
      toast.error('Error al actualizar el estado del comercio');
    } finally {
      setTogglingOpen(false);
    }
  };

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, driver:drivers(*)')
      .eq('tenant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) {
      setOrders(data as Order[]);
    } else if (error) {
      console.warn('Retrying loading orders without driver join...', error);
      const { data: fallbackOrders } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (fallbackOrders) setOrders(fallbackOrders as Order[]);
    }
  }, [restaurant.id, supabase]);

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('tenant_id', restaurant.id);
    if (data) setDrivers(data as Driver[]);
  }, [restaurant.id, supabase]);

  const loadApiKeys = useCallback(async () => {
    const { data } = await supabase
      .from('tenant_api_keys')
      .select('*')
      .eq('tenant_id', restaurant.id)
      .order('created_at', { ascending: false });
    if (data) setApiKeys(data as MerchantApiKey[]);
  }, [restaurant.id, supabase]);

  useEffect(() => {
    // Carga inicial de datos del panel desde Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    loadDrivers();
    loadApiKeys();
  }, [loadOrders, loadDrivers, loadApiKeys]);

  // Realtime Supabase Subscription for Orders
  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurant.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `tenant_id=eq.${restaurant.id}`,
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: newOrder } = await supabase
            .from('orders')
            .select('*, driver:drivers(*)')
            .eq('id', payload.new.id)
            .single();
          if (newOrder) {
            setOrders(prev => [newOrder as Order, ...prev]);
            try {
              audioRef.current = new Audio('/sounds/new-order.mp3');
              audioRef.current.play().catch(() => {});
            } catch {}
            toast.info(`Nuevo despacho #${newOrder.order_number} (${newOrder.origin_system || 'API'}) de ${newOrder.customer_name}`, { duration: 8000 });
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

  // Order Lifecycle Transitions
  const advanceStatus = async (order: Order) => {
    if (order.status === 'RECIBIDO') {
      await updateOrderStatus(order.id, 'EN_PREPARACION');
    } else if (order.status === 'EN_PREPARACION') {
      await updateOrderStatus(order.id, 'LISTO');
    } else if (order.status === 'LISTO') {
      if (!order.driver_id && drivers.some(d => !d.deleted_at)) {
        toast.info('Seleccione un repartidor para despachar el pedido');
        setSelectedOrder(order);
        return;
      }
      await updateOrderStatus(order.id, 'EN_CAMINO', { in_route_at: new Date().toISOString() });
    } else if (order.status === 'EN_CAMINO') {
      setPinModalOrder(order);
      setPinInput('');
    }
  };

  const updateOrderStatus = async (orderId: string, nextStatus: OrderStatus, extraFields: Partial<Order> = {}) => {
    setUpdatingId(orderId);
    const updates: Partial<Order> = { status: nextStatus, ...extraFields };
    if (nextStatus === 'ENTREGADO') updates.delivered_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
    if (error) {
      toast.error('Error al actualizar el estado del despacho');
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, ...updates } : null);
      }
      toast.success(`Despacho actualizado -> ${STATUS_CONFIG[nextStatus].label}`);
    }
    setUpdatingId(null);
  };

  // Confirm PIN delivery
  const handleConfirmPinDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalOrder) return;
    if (pinInput.trim() !== pinModalOrder.pin_code) {
      toast.error('PIN incorrecto. El destinatario debe proporcionar su código de seguridad de 4 dígitos.');
      return;
    }

    setValidatingPin(true);
    await updateOrderStatus(pinModalOrder.id, 'ENTREGADO');
    setValidatingPin(false);
    setPinModalOrder(null);
    toast.success(`¡Entrega #${pinModalOrder.order_number} validada con éxito mediante PIN!`);
  };

  // Structured Cancellation
  const handleConfirmCancellation = async () => {
    if (!cancelModalOrder) return;
    setCancelling(true);

    const reasonText = cancelNote.trim()
      ? `${CANCELLATION_REASONS[cancelReason]}: ${cancelNote.trim()}`
      : CANCELLATION_REASONS[cancelReason];

    const updatedNotes = cancelModalOrder.notes
      ? `${cancelModalOrder.notes} [CANCELADO: ${reasonText}]`
      : `[CANCELADO: ${reasonText}]`;

    let { error } = await supabase
      .from('orders')
      .update({
        status: 'CANCELADO',
        cancellation_reason: reasonText,
        notes: updatedNotes,
      })
      .eq('id', cancelModalOrder.id);

    if (error) {
      const res = await supabase
        .from('orders')
        .update({
          status: 'CANCELADO',
          notes: updatedNotes,
        })
        .eq('id', cancelModalOrder.id);
      error = res.error;
    }

    if (!error) {
      setOrders(prev => prev.map(o => o.id === cancelModalOrder.id ? { ...o, status: 'CANCELADO', cancellation_reason: reasonText, notes: updatedNotes } : o));
      if (selectedOrder?.id === cancelModalOrder.id) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'CANCELADO', cancellation_reason: reasonText, notes: updatedNotes } : null);
      }
      toast.success(`Despacho #${cancelModalOrder.order_number} cancelado`);
      setCancelModalOrder(null);
      setCancelNote('');
    } else {
      toast.error('Error al cancelar el despacho');
    }
    setCancelling(false);
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (readOnly) {
      toast.error('Suscripción vencida: no se pueden asignar motorizados. Renueva tu plan.');
      return;
    }

    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_driver',
          tenantId: restaurant.id,
          orderId,
          driverId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo asignar el repartidor.');

      const updated = data.order as Order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, ...updated } : null));
      }
      toast.success('Repartidor asignado correctamente');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo asignar el repartidor.');
    }
  };

  const sendTrackingLink = (order: Order) => {
    const url = `${window.location.origin}/tracking/${order.id}`;
    const msg = encodeURIComponent(
      `Hola ${order.customer_name}.\nSu pedido de ${restaurant.name} está en camino.\n\nPIN de Entrega: *${order.pin_code}*\n\nSeguimiento satelital en vivo:\n${url}`
    );
    const phone = order.customer_phone.replace(/\D/g, '');
    window.open(`https://wa.me/51${phone}?text=${msg}`, '_blank');
  };

  // Create Manual Dispatch Order
  const handleCreateManualDispatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (readOnly) {
      toast.error('Suscripción vencida: el panel está en modo solo lectura. Renueva tu plan.');
      return;
    }
    if (snapshot.quotaReached) {
      toast.error('Límite de pedidos alcanzado para el ciclo actual. Amplía tu plan para continuar.');
      return;
    }
    if (!manualForm.customer_name || !manualForm.customer_phone || !manualForm.delivery_address) {
      toast.error('Nombre, teléfono y dirección son obligatorios');
      return;
    }

    setCreatingManual(true);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: restaurant.id,
          customerName: manualForm.customer_name,
          customerPhone: manualForm.customer_phone,
          deliveryAddress: manualForm.delivery_address,
          deliveryReference: manualForm.delivery_reference,
          itemDescription: manualForm.item_description,
          totalAmount: manualForm.total_amount,
          notes: manualForm.notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el despacho manual.');

      const newOrder = data.order as Order;
      setOrders((prev) => [newOrder, ...prev]);
      toast.success(
        `Despacho #${newOrder.order_number} creado con éxito. PIN: ${newOrder.pin_code}`
      );
      setShowManualModal(false);
      setManualForm({
        customer_name: '',
        customer_phone: '',
        delivery_address: '',
        delivery_reference: '',
        item_description: '',
        total_amount: '',
        notes: '',
      });
      await refreshSubscription();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al registrar el despacho manual.'
      );
    } finally {
      setCreatingManual(false);
    }
  };

  // API Keys Management
  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      toast.error('Suscripción vencida: renueva tu plan para generar nuevas claves API.');
      return;
    }
    setGeneratingKey(true);
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() || 'Clave API Producción' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al generar clave');

      setRawKeyDisplay({ rawKey: data.raw_key, name: data.key.name });
      setApiKeys(prev => [data.key, ...prev]);
      setShowNewKeyModal(false);
      setNewKeyName('');
      toast.success('Clave API generada con éxito');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al generar clave API');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleToggleApiKey = async (key: MerchantApiKey) => {
    const newVal = !key.is_active;
    const { error } = await supabase
      .from('tenant_api_keys')
      .update({ is_active: newVal })
      .eq('id', key.id);
    if (!error) {
      setApiKeys(prev => prev.map(k => k.id === key.id ? { ...k, is_active: newVal } : k));
      toast.success(newVal ? 'Clave API activada' : 'Clave API deshabilitada');
    }
  };

  const handleDeleteApiKey = async (key: MerchantApiKey) => {
    if (!confirm(`¿Eliminar la clave "${key.name}"? Los sistemas que usen este token ya no podrán despachar.`)) return;
    const { error } = await supabase.from('tenant_api_keys').delete().eq('id', key.id);
    if (!error) {
      setApiKeys(prev => prev.filter(k => k.id !== key.id));
      toast.success('Clave API eliminada');
    }
  };

  const handleCopyRawKey = () => {
    if (!rawKeyDisplay) return;
    navigator.clipboard.writeText(rawKeyDisplay.rawKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
    toast.success('Clave copiada al portapapeles');
  };

  // Metrics Data Loading
  const loadMetricsOrders = useCallback(async (range: MetricsRange) => {
    let from: string;
    let to: string = new Date().toISOString();
    const now = new Date();
    if (range === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (range === '7days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString();
    } else if (range === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
    }
    const { data } = await supabase
      .from('orders')
      .select('*, driver:drivers(*)')
      .eq('tenant_id', restaurant.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });
    if (data) setMetricsOrders(data as Order[]);
  }, [restaurant.id, supabase]);

  // Historial completo (todas las fechas) para los totales por repartidor.
  // Se limita a las columnas necesarias para no traer todo el pedido.
  const loadDriverHistory = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, driver_id, status, created_at, delivered_at, total_amount')
      .eq('tenant_id', restaurant.id)
      .not('driver_id', 'is', null)
      .order('created_at', { ascending: false });
    if (data) setDriverHistoryOrders(data as Order[]);
  }, [restaurant.id, supabase]);

  useEffect(() => {
    if (adminTab === 'metrics') {
      // Carga perezosa de métricas al abrir la pestaña.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadMetricsOrders(metricsRange);
      loadDriverHistory();
    }
  }, [adminTab, metricsRange, loadMetricsOrders, loadDriverHistory]);

  const metricsData = useMemo(() => {
    const delivered = metricsOrders.filter(o => o.status === 'ENTREGADO');
    const cancelled = metricsOrders.filter(o => o.status === 'CANCELADO');
    const totalRevenue = delivered.reduce((sum, o) => sum + o.total_amount, 0);

    const deliveryTimes = delivered
      .filter(o => o.delivered_at && o.created_at)
      .map(o => (new Date(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / 60000);
    const avgDeliveryTime = deliveryTimes.length > 0
      ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length)
      : 0;

    const successRate = metricsOrders.length > 0
      ? Math.round((delivered.length / (delivered.length + cancelled.length || 1)) * 100)
      : 0;

    const paymentCounts: Record<string, number> = { EFECTIVO: 0, YAPE: 0, PLIN: 0 };
    delivered.forEach(o => {
      if (o.payment_method) {
        paymentCounts[o.payment_method] = (paymentCounts[o.payment_method] || 0) + 1;
      }
    });
    const paymentTotal = Object.values(paymentCounts).reduce((a, b) => a + b, 0) || 1;

    const driverStats = drivers.filter(d => !d.deleted_at).map(d => {
      const driverOrders = delivered.filter(o => o.driver_id === d.id);
      const driverTimes = driverOrders
        .filter(o => o.delivered_at)
        .map(o => (new Date(o.delivered_at!).getTime() - new Date(o.created_at).getTime()) / 60000);
      const avgTime = driverTimes.length > 0
        ? Math.round(driverTimes.reduce((a, b) => a + b, 0) / driverTimes.length)
        : 0;
      return {
        driver: d,
        deliveredCount: driverOrders.length,
        avgTime,
        cancelledCount: cancelled.filter(o => o.driver_id === d.id).length,
      };
    }).filter(s => s.deliveredCount > 0 || s.cancelledCount > 0)
      .sort((a, b) => b.deliveredCount - a.deliveredCount);

    return {
      totalOrders: metricsOrders.length,
      deliveredCount: delivered.length,
      cancelledCount: cancelled.length,
      totalRevenue,
      avgDeliveryTime,
      successRate,
      paymentCounts,
      paymentTotal,
      driverStats,
    };
  }, [metricsOrders, drivers]);

  // Totales históricos por repartidor (todas las fechas)
  const driverTotals = useMemo(() => {
    type Acc = { assigned: number; delivered: number; cancelled: number; inProgress: number; revenue: number; times: number[] };
    const byDriver = new Map<string, Acc>();

    for (const o of driverHistoryOrders) {
      if (!o.driver_id) continue;
      const acc = byDriver.get(o.driver_id)
        ?? { assigned: 0, delivered: 0, cancelled: 0, inProgress: 0, revenue: 0, times: [] };
      acc.assigned += 1;
      if (o.status === 'ENTREGADO') {
        acc.delivered += 1;
        acc.revenue += o.total_amount || 0;
        if (o.delivered_at && o.created_at) {
          const mins = (new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()) / 60000;
          if (mins >= 0) acc.times.push(mins);
        }
      } else if (o.status === 'CANCELADO') {
        acc.cancelled += 1;
      } else {
        acc.inProgress += 1;
      }
      byDriver.set(o.driver_id, acc);
    }

    return [...byDriver.entries()]
      .map(([driverId, acc]) => {
        const driver = drivers.find(d => d.id === driverId);
        return {
          driverId,
          name: driver?.name ?? 'Repartidor',
          isDeleted: Boolean(driver?.deleted_at),
          assigned: acc.assigned,
          delivered: acc.delivered,
          cancelled: acc.cancelled,
          inProgress: acc.inProgress,
          revenue: acc.revenue,
          avgTime: acc.times.length ? Math.round(acc.times.reduce((a, b) => a + b, 0) / acc.times.length) : 0,
        };
      })
      .sort((a, b) => b.delivered - a.delivered || b.assigned - a.assigned);
  }, [driverHistoryOrders, drivers]);

  // Desglose diario (rango seleccionado): día -> repartidor -> entregados
  const driverDaily = useMemo(() => {
    const byDay = new Map<string, Map<string, number>>();
    for (const o of metricsOrders) {
      if (!o.driver_id || o.status !== 'ENTREGADO') continue;
      const iso = o.delivered_at || o.created_at;
      if (!iso) continue;
      const day = iso.slice(0, 10);
      const inner = byDay.get(day) ?? new Map<string, number>();
      inner.set(o.driver_id, (inner.get(o.driver_id) ?? 0) + 1);
      byDay.set(day, inner);
    }
    return { byDay, days: [...byDay.keys()].sort().reverse() };
  }, [metricsOrders]);

  // Columnas del desglose diario: solo repartidores con entregas en el rango
  const driverDailyColumns = useMemo(() => {
    const ids = new Set<string>();
    for (const inner of driverDaily.byDay.values()) {
      for (const id of inner.keys()) ids.add(id);
    }
    return driverTotals.filter(r => ids.has(r.driverId));
  }, [driverDaily, driverTotals]);

  const hasAdvancedFilters = Boolean(
    searchTerm.trim() ||
    filterDriver !== 'all' ||
    filterStatus !== 'all' ||
    filterOrigin !== 'all' ||
    filterDate !== 'all'
  );

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterDriver('all');
    setFilterStatus('all');
    setFilterOrigin('all');
    setFilterDate('all');
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // 1. Tab-level status filter
      if (activeFilter === 'active' && ['ENTREGADO', 'CANCELADO'].includes(o.status)) return false;
      if (activeFilter === 'delivered' && o.status !== 'ENTREGADO') return false;

      // 2. Specific Sub-status filter
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;

      // 3. Driver assignment filter
      if (filterDriver === 'unassigned' && o.driver_id) return false;
      if (filterDriver !== 'all' && filterDriver !== 'unassigned' && o.driver_id !== filterDriver) return false;

      // 4. Origin / Channel filter (API vs Manual Dispatch)
      const isManual = o.origin_system === 'MANUAL_DISPATCH' || o.notes?.toLowerCase().includes('despacho manual');
      if (filterOrigin === 'API' && isManual) return false;
      if (filterOrigin === 'MANUAL' && !isManual) return false;

      // 5. Date filter
      if (filterDate !== 'all') {
        const orderDate = new Date(o.created_at);
        const now = new Date();
        if (filterDate === 'today') {
          if (orderDate.toDateString() !== now.toDateString()) return false;
        } else if (filterDate === 'yesterday') {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          if (orderDate.toDateString() !== yesterday.toDateString()) return false;
        } else if (filterDate === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < sevenDaysAgo) return false;
        } else if (filterDate === 'month') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (orderDate < thirtyDaysAgo) return false;
        }
      }

      // 6. Universal Search Term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesOrderNum = `#${o.order_number}`.includes(q) || String(o.order_number).includes(q);
        const matchesPin = o.pin_code?.toLowerCase().includes(q);
        const matchesCustomer = o.customer_name?.toLowerCase().includes(q);
        const matchesPhone = o.customer_phone?.toLowerCase().includes(q);
        const matchesAddress = o.delivery_address?.toLowerCase().includes(q);
        const matchesRef = o.delivery_reference?.toLowerCase().includes(q);
        const matchesExtId = o.external_order_id?.toLowerCase().includes(q);
        if (!matchesOrderNum && !matchesPin && !matchesCustomer && !matchesPhone && !matchesAddress && !matchesRef && !matchesExtId) {
          return false;
        }
      }

      return true;
    });
  }, [orders, activeFilter, filterStatus, filterDriver, filterOrigin, filterDate, searchTerm]);

  const activeCount    = orders.filter(o => !['ENTREGADO', 'CANCELADO'].includes(o.status)).length;
  const deliveredCount = orders.filter(o => o.status === 'ENTREGADO').length;
  const allCount       = orders.length;
  const enRutaCount    = orders.filter(o => o.status === 'EN_CAMINO').length;
  const todayCount     = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const sidebarNavItems: SidebarNavItem[] = [
    { id: 'dashboard', icon: <BarChart2 size={18} />, label: 'Monitor de Despachos', badge: activeCount },
    { id: 'fleet',     icon: <Users size={18} />,     label: 'Personal Operativo', badge: activeDriverCount },
    { id: 'api_keys',  icon: <Key size={18} />,       label: 'Integración API B2B', badge: apiKeys.filter(k => k.is_active).length },
    { id: 'metrics',   icon: <TrendingUp size={18} />, label: 'Métricas' },
    { id: 'billing',   icon: <Receipt size={18} />,   label: 'Suscripción y Facturación' },
    { id: 'settings',  icon: <Settings size={18} />,  label: 'Configuración del Negocio' },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9', fontFamily: 'Inter, sans-serif' }}>

      {/* ================= SIDEBAR (SaaS Indigo) ================= */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-indigo-950 text-white flex flex-col shadow-xl transition-transform duration-300
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>

        {/* Brand Header with Store Name */}
        <div className="p-4 sm:p-5 border-b border-indigo-800/60 space-y-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold shadow-md"
              style={{ background: currentRestaurant.brand_color || 'var(--saas-600)' }}
            >
              <Store size={18} color="white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-black text-sm text-white tracking-tight truncate" title={currentRestaurant.name}>
                {currentRestaurant.name}
              </h1>
              <p className="text-[11px] text-indigo-300 font-medium truncate">Consola de Despacho</p>
            </div>
          </div>

          {/* Multi-Tenant Switcher */}
          {allRestaurants && allRestaurants.length > 1 && (
            <div className="pt-1">
              <label className="text-[9px] uppercase font-bold text-indigo-400 block mb-1">
                Comercio Activo:
              </label>
              <select
                value={restaurant.slug}
                onChange={(e) => {
                  if (e.target.value === '__hub__') {
                    window.location.href = '/admin';
                  } else if (e.target.value === '__superadmin__') {
                    window.location.href = '/superadmin';
                  } else {
                    window.location.href = `/admin/${e.target.value}`;
                  }
                }}
                className="w-full bg-indigo-950 border border-indigo-700/80 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {allRestaurants.map(r => (
                  <option key={r.id} value={r.slug} className="bg-indigo-950 text-white font-bold">
                    {r.name}
                  </option>
                ))}
                <option disabled className="bg-indigo-900 text-indigo-400">──────────</option>
                <option value="__hub__" className="bg-indigo-950 text-indigo-200">
                  Ver Todos los Comercios
                </option>
                <option value="__superadmin__" className="bg-indigo-950 text-purple-300 font-bold">
                  Consola SuperAdmin
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {sidebarNavItems.map(item => {
            const isActive = adminTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setAdminTab(item.id); setSelectedOrder(null); setSidebarOpen(false); }}
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

          {/* Superadmin: Onboarding link */}
          {userRole === 'superadmin' && (
            <div className="pt-1">
              <a
                href="/onboarding"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg text-xs font-bold transition-all border border-emerald-500/30 group"
                id="btn-open-onboarding"
              >
                <div className="flex items-center gap-2">
                  <Plus size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>Nuevo Comercio</span>
                </div>
                <span className="text-[10px] bg-emerald-500/30 px-1.5 py-0.5 rounded text-emerald-200">
                  Admin
                </span>
              </a>
            </div>
          )}
        </nav>

        {/* Perfil del usuario + Plan actual */}
        <div className="px-4 pb-3 pt-3 border-t border-indigo-800/60 space-y-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-center text-xs font-black text-white shrink-0">
              {(userEmail || currentRestaurant.name).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white truncate" title={userEmail || undefined}>
                {userEmail || 'Usuario del comercio'}
              </p>
              <p className="text-[10px] text-indigo-300 capitalize">
                {userRole === 'superadmin' ? 'Superadmin' : userRole}
              </p>
            </div>
          </div>
          <PlanBadge snapshot={snapshot} onOpenBilling={() => setAdminTab('billing')} />
        </div>

        {/* Store Status Toggle */}
        <div className="p-4 border-t border-indigo-800/60 bg-indigo-950/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-300">
              Motor Logístico
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${currentRestaurant.is_open ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-red-500/20 text-red-300 border border-red-400/40'}`}>
              {currentRestaurant.is_open ? 'RECIBIENDO' : 'PAUSADO'}
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
              <>Pausar Despachos</>
            ) : (
              <>Reanudar Despachos</>
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
            {currentRestaurant.is_open ? 'Activo' : 'Pausado'}
          </button>
        </header>

        {/* Guard global de suscripción / cuota (persistente en todas las vistas) */}
        <SubscriptionBanner snapshot={snapshot} onOpenBilling={() => setAdminTab('billing')} />

        {/* ================= TAB 1: DASHBOARD (DESPACHOS) ================= */}
        {adminTab === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                    {currentRestaurant.name}
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Monitor de Despachos
                  </span>
                </div>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Control logístico y telemetría de órdenes en tiempo real</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowManualModal(true)}
                  disabled={!canCreateOrders}
                  title={
                    readOnly
                      ? 'Suscripción vencida: renueva tu plan para crear pedidos'
                      : snapshot.quotaReached
                        ? 'Límite de pedidos alcanzado para el ciclo actual'
                        : undefined
                  }
                  className="btn btn-indigo text-xs sm:text-sm py-2 px-3.5 shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  id="btn-new-manual-dispatch"
                >
                  <PlusCircle size={16} /> + Nuevo Despacho
                </button>
                <div
                  className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    readOnly
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : snapshot.quotaReached
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      readOnly
                        ? 'bg-rose-500'
                        : snapshot.quotaReached
                          ? 'bg-amber-500'
                          : 'bg-emerald-500 pulse-dot'
                    }`}
                  />
                  {readOnly ? 'Solo lectura' : snapshot.quotaReached ? 'Cuota agotada' : 'Sistema Activo'}
                </div>
              </div>
            </header>

            {/* Medidor de cuota mensual */}
            <OrderQuotaWidget snapshot={snapshot} onOpenBilling={() => setAdminTab('billing')} />

            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-4 sm:mb-8">
              <div className="bg-white p-2.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 text-center sm:text-left">
                <div className="w-7 h-7 sm:w-12 sm:h-12 bg-indigo-50 sm:bg-indigo-100 rounded-lg sm:rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                  <Package size={14} className="sm:hidden" />
                  <Package size={22} className="hidden sm:block" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-sm text-slate-500 font-semibold leading-tight">Envíos Hoy</p>
                  <p className="text-sm sm:text-2xl font-bold text-slate-800 leading-tight mt-0.5 sm:mt-0">{todayCount}</p>
                </div>
              </div>

              <div className="bg-white p-2.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 text-center sm:text-left">
                <div className="w-7 h-7 sm:w-12 sm:h-12 bg-amber-50 sm:bg-amber-100 rounded-lg sm:rounded-full flex items-center justify-center text-amber-600 shrink-0">
                  <Truck size={14} className="sm:hidden" />
                  <Truck size={22} className="hidden sm:block" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-sm text-slate-500 font-semibold leading-tight">En Ruta</p>
                  <p className="text-sm sm:text-2xl font-bold text-amber-600 leading-tight mt-0.5 sm:mt-0">{enRutaCount}</p>
                </div>
              </div>

              <div className="bg-white p-2.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 text-center sm:text-left">
                <div className="w-7 h-7 sm:w-12 sm:h-12 bg-emerald-50 sm:bg-emerald-100 rounded-lg sm:rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                  <Boxes size={14} className="sm:hidden" />
                  <Boxes size={22} className="hidden sm:block" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-sm text-slate-500 font-semibold leading-tight">Activos</p>
                  <p className="text-sm sm:text-2xl font-bold text-emerald-600 leading-tight mt-0.5 sm:mt-0">{activeCount}</p>
                </div>
              </div>
            </div>

            {/* Orders Table Container */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Filter Tabs & Quick Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 p-2 gap-2 bg-slate-50/50">
                <div className="flex gap-1 overflow-x-auto">
                  {([['active', 'Activos', activeCount], ['delivered', 'Entregados', deliveredCount], ['all', 'Todos', allCount]] as const).map(([tab, label, count]) => (
                    <button
                      key={tab}
                      onClick={() => setActiveFilter(tab)}
                      className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                        activeFilter === tab
                          ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {label}
                      {count != null && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeFilter === tab ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {hasAdvancedFilters && (
                  <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
                    <span>Filtrando <strong>{filteredOrders.length}</strong> de <strong>{orders.length}</strong></span>
                    <button
                      onClick={handleResetFilters}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline text-xs ml-1"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>

              {/* Logistics Filters Toolbar */}
              <div className="p-3 sm:p-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col xl:flex-row gap-2.5 items-stretch xl:items-center justify-between">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por #orden, PIN, cliente, tel, dir o ID externo..."
                    className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter Selectors */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Motorizado */}
                  <select
                    value={filterDriver}
                    onChange={(e) => setFilterDriver(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 sm:py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Motorizado: Todos</option>
                    <option value="unassigned">Sin asignar</option>
                    {drivers.filter(d => !d.deleted_at).map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.is_active ? '' : '(Inactivo)'}
                      </option>
                    ))}
                  </select>

                  {/* Estado (contextual) */}
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 sm:py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Estado: Todos</option>
                    {activeFilter !== 'delivered' && (
                      <>
                        <option value="RECIBIDO">Recibido</option>
                        <option value="EN_PREPARACION">En preparación</option>
                        <option value="LISTO">Listo para despacho</option>
                        <option value="EN_CAMINO">En camino</option>
                      </>
                    )}
                    {activeFilter !== 'active' && (
                      <>
                        <option value="ENTREGADO">Entregado</option>
                        <option value="CANCELADO">Cancelado</option>
                      </>
                    )}
                  </select>

                  {/* Fecha */}
                  <select
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 sm:py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Fecha: Todas</option>
                    <option value="today">Hoy</option>
                    <option value="yesterday">Ayer</option>
                    <option value="7days">Últimos 7 días</option>
                    <option value="month">Últimos 30 días</option>
                  </select>

                  {/* Canal / Origen */}
                  <select
                    value={filterOrigin}
                    onChange={(e) => setFilterOrigin(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 sm:py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="all">Canal: Todos</option>
                    <option value="API">API B2B</option>
                    <option value="MANUAL">Despacho Manual</option>
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <Package size={36} className="mx-auto mb-2 opacity-50 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-600">
                    {hasAdvancedFilters ? 'No se encontraron despachos con los filtros aplicados' : 'No hay órdenes en esta categoría'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {hasAdvancedFilters ? 'Prueba ajustando los criterios de búsqueda o fecha' : 'Crea un despacho manual o conecta tu sistema vía API'}
                  </p>
                  {hasAdvancedFilters && (
                    <button
                      onClick={handleResetFilters}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                    >
                      <RotateCcw size={12} />
                      Restablecer todos los filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Orden / Origen</th>
                          <th className="py-3 px-4">PIN</th>
                          <th className="py-3 px-4">Destinatario</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4">Motorizado</th>
                          <th className="py-3 px-4">Total</th>
                          <th className="py-3 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.map(order => (
                          <tr
                            key={order.id}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <td className="py-3.5 px-4 font-medium text-slate-900">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">#{order.order_number}</span>
                                {(() => {
                                  const origin = order.origin_system || (order.notes?.match(/\[(.*?)\]/)?.[1]) || 'API';
                                  if (origin.includes('RESTAURANTE') || origin.includes('Fuego')) {
                                    return (
                                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                                        Restaurante
                                      </span>
                                    );
                                  }
                                  if (origin.includes('LIBRERIA') || origin.includes('Atenea')) {
                                    return (
                                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                                        Librería
                                      </span>
                                    );
                                  }
                                  if (origin === 'MANUAL_DISPATCH') {
                                    return (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                        Manual
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      {origin}
                                    </span>
                                  );
                                })()}
                              </div>
                              <span className="text-xs text-slate-400 font-normal block mt-0.5">{timeAgo(order.created_at)}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-mono font-bold text-xs">
                                <ShieldCheck size={12} className="text-amber-600" />
                                {order.pin_code || (order.notes?.match(/\[PIN:\s*(\d{4})\]/)?.[1]) || '----'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="font-semibold text-slate-800">{order.customer_name}</p>
                              <p className="text-xs text-slate-400 truncate max-w-[200px]">{order.delivery_address}</p>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`badge badge-${order.status}`}>
                                {STATUS_CONFIG[order.status].icon}
                                {STATUS_CONFIG[order.status].label}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {order.driver ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md">
                                  <User size={12} /> {order.driver.name}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Sin asignar</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-800">
                              S/ {order.total_amount.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {STATUS_CONFIG[order.status].next && (
                                  <button
                                    onClick={() => advanceStatus(order)}
                                    disabled={updatingId === order.id}
                                    className="btn btn-indigo btn-sm text-xs py-1.5 px-2.5"
                                  >
                                    {updatingId === order.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      STATUS_NEXT_LABEL[order.status]
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => setTrackingDrawerOrder(order)}
                                  className="btn btn-ghost btn-sm text-indigo-600 p-1.5 hover:bg-indigo-50"
                                  title="Ver Mapa Satelital"
                                >
                                  <MapPin size={16} />
                                </button>
                                {!['ENTREGADO', 'CANCELADO'].includes(order.status) && (
                                  <button
                                    onClick={() => setCancelModalOrder(order)}
                                    className="btn btn-ghost btn-sm text-red-500 p-1.5 hover:bg-red-50"
                                    title="Cancelar Despacho"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {filteredOrders.map(order => (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="p-4 space-y-3 hover:bg-slate-50/50 cursor-pointer"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-base text-slate-900">#{order.order_number}</span>
                              <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-bold">
                                {order.origin_system || 'API'}
                              </span>
                              <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                <ShieldCheck size={10} className="text-amber-600" />
                                PIN {order.pin_code}
                              </div>
                            </div>
                            <p className="text-xs text-slate-400">{timeAgo(order.created_at)}</p>
                          </div>
                          <span className={`badge badge-${order.status} text-[10px]`}>
                            {STATUS_CONFIG[order.status].icon}
                            {STATUS_CONFIG[order.status].label}
                          </span>
                        </div>

                        <div>
                          <p className="font-bold text-sm text-slate-800">{order.customer_name}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} className="shrink-0 text-slate-400" />
                            <span className="truncate">{order.delivery_address}</span>
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="font-black text-slate-800 text-sm">S/ {order.total_amount.toFixed(2)}</span>
                          <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                            {STATUS_CONFIG[order.status].next && (
                              <button
                                onClick={() => advanceStatus(order)}
                                disabled={updatingId === order.id}
                                className="btn btn-indigo text-[11px] py-1.5 px-3"
                              >
                                {STATUS_NEXT_LABEL[order.status]}
                              </button>
                            )}
                            <button
                              onClick={() => setTrackingDrawerOrder(order)}
                              className="btn btn-secondary text-indigo-600 p-1.5"
                            >
                              <MapPin size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: PERSONAL OPERATIVO (REPARTIDORES + KDS) ================= */}
        {adminTab === 'fleet' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in">
            <OperationalAccountsPanel
              tenantId={restaurant.id}
              initialDrivers={drivers}
              snapshot={snapshot}
              onDriversChanged={handleDriversChanged}
              onOpenBilling={() => setAdminTab('billing')}
            />
          </div>
        )}

        {/* ================= TAB 3: B2B API INTEGRATION (PLUG & PLAY) ================= */}
        {adminTab === 'api_keys' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in space-y-6">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                    {currentRestaurant.name}
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Integración API REST B2B
                  </span>
                </div>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Externaliza y automatiza tus despachos en 5 minutos desde cualquier software o e-commerce</p>
              </div>
              <button
                onClick={() => setShowNewKeyModal(true)}
                disabled={readOnly}
                title={
                  readOnly
                    ? 'Suscripción vencida: renueva tu plan para generar nuevas claves'
                    : undefined
                }
                className="btn btn-indigo text-xs sm:text-sm py-2 px-3.5 shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} /> Generar Clave API
              </button>
            </header>

            {/* Architecture Banner */}
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 text-white rounded-2xl p-6 shadow-md border border-indigo-700">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 text-indigo-300">
                  <Code size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-base text-white">Desacoplamiento B2B Agnóstico</h3>
                  <p className="text-xs text-indigo-200 leading-relaxed max-w-3xl">
                    Tu sistema de ventas o ERP envía los despachos a nuestro motor logístico mediante el endpoint <code className="bg-indigo-950 px-1.5 py-0.5 rounded text-amber-300 font-mono">POST /api/v1/orders</code>. Nosotros gestionamos telemetría GPS, KDS, tiempos y validación de PIN anti-fraude.
                  </p>
                </div>
              </div>
            </div>

            {/* Active API Keys List */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5">
              <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
                <Key size={16} className="text-indigo-600" /> Claves de API Activas
              </h3>

              {apiKeys.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Key size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No has generado claves de API aún</p>
                  <p className="text-xs text-slate-400 mt-0.5">Haz clic en &ldquo;Generar Clave API&rdquo; para obtener tus credenciales de integración.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {apiKeys.map(k => (
                    <div key={k.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-800">{k.name}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {k.is_active ? 'Activa' : 'Desactivada'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">Prefijo: {k.key_prefix}</p>
                        <p className="text-[11px] text-slate-400">Creada: {new Date(k.created_at).toLocaleDateString('es-PE')}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleApiKey(k)}
                          className={`btn btn-sm text-xs py-1 px-2.5 ${k.is_active ? 'btn-secondary text-amber-700' : 'btn-indigo'}`}
                        >
                          {k.is_active ? 'Pausar' : 'Activar'}
                        </button>
                        <button
                          onClick={() => handleDeleteApiKey(k)}
                          className="btn btn-ghost btn-sm text-red-500 p-1.5 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Code Snippets */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3.5 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800">Ejemplo de Integración (Crear Despacho)</h3>
                  <p className="text-xs text-slate-500">Envía un requerimiento de entrega en tiempo real a la API</p>
                </div>

                <div className="flex gap-1 bg-slate-200/70 p-1 rounded-lg">
                  {(['curl', 'js', 'python'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveCodeTab(tab)}
                      className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${
                        activeCodeTab === tab ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5 bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto">
                {activeCodeTab === 'curl' && (
                  <pre>{`curl -X POST "${typeof window !== 'undefined' ? window.location.origin : 'https://api.tu-saas.com'}/api/v1/orders" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: dtk_live_TU_CLAVE_AQUI" \\
  -d '{
    "external_order_id": "ORD-9481",
    "customer": {
      "name": "Juan Perez",
      "phone": "+51987654321",
      "address": "Av. Principal 456, Lima",
      "reference": "Dpto 302",
      "lat": -12.1219,
      "lng": -77.0298
    },
    "items": [
      { "name": "Medicamentos / Zapatillas / Pedido Criollo", "quantity": 1, "unit_price": 45.00 }
    ],
    "payment": {
      "method": "YAPE",
      "total_amount": 45.00
    },
    "notes": "Llamar al llegar a la puerta"
  }'`}</pre>
                )}

                {activeCodeTab === 'js' && (
                  <pre>{`const response = await fetch('${typeof window !== 'undefined' ? window.location.origin : 'https://api.tu-saas.com'}/api/v1/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'dtk_live_TU_CLAVE_AQUI',
  },
  body: JSON.stringify({
    external_order_id: 'ORD-9481',
    customer: {
      name: 'Juan Perez',
      phone: '+51987654321',
      address: 'Av. Principal 456, Lima',
      reference: 'Dpto 302',
      lat: -12.1219,
      lng: -77.0298,
    },
    items: [
      { name: 'Paquete de despacho', quantity: 1, unit_price: 45.00 }
    ],
    payment: {
      method: 'YAPE',
      total_amount: 45.00,
    },
  }),
});

const data = await response.json();
console.log('Despacho creado:', data.order_id, 'PIN:', data.pin_code, 'Tracking:', data.tracking_url);`}</pre>
                )}

                {activeCodeTab === 'python' && (
                  <pre>{`import requests

url = "${typeof window !== 'undefined' ? window.location.origin : 'https://api.tu-saas.com'}/api/v1/orders"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "dtk_live_TU_CLAVE_AQUI",
}
payload = {
    "external_order_id": "ORD-9481",
    "customer": {
        "name": "Juan Perez",
        "phone": "+51987654321",
        "address": "Av. Principal 456, Lima",
        "reference": "Dpto 302",
        "lat": -12.1219,
        "lng": -77.0298,
    },
    "items": [{"name": "Paquete logística", "quantity": 1, "unit_price": 45.00}],
    "payment": {"method": "YAPE", "total_amount": 45.00},
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}</pre>
                )}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                <strong className="text-slate-700">Notas:</strong> métodos de pago válidos:{' '}
                <code className="font-mono text-indigo-700">EFECTIVO</code>,{' '}
                <code className="font-mono text-indigo-700">YAPE</code>,{' '}
                <code className="font-mono text-indigo-700">PLIN</code>. Envía la clave desde tu{' '}
                <strong>servidor</strong> (nunca en el navegador). La respuesta incluye{' '}
                <code className="font-mono text-indigo-700">order_id</code>,{' '}
                <code className="font-mono text-indigo-700">pin_code</code> y{' '}
                <code className="font-mono text-indigo-700">tracking_url</code>.
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: METRICS ================= */}
        {adminTab === 'metrics' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    {currentRestaurant.name}
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Métricas de Rendimiento
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Análisis operativo del motor logístico</p>
              </div>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {([['today', 'Hoy'], ['7days', '7 días'], ['month', 'Este mes'], ['last_month', 'Mes anterior']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMetricsRange(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      metricsRange === key
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </header>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {[
                { label: 'Despachos', value: metricsData.totalOrders, icon: <Package size={20} />, color: '#4F46E5', bg: '#EEF2FF' },
                { label: 'Monto Total', value: `S/ ${metricsData.totalRevenue.toFixed(2)}`, icon: <DollarSign size={20} />, color: '#059669', bg: '#ECFDF5' },
                { label: 'Tiempo prom. ciclo', value: `${metricsData.avgDeliveryTime} min`, icon: <Timer size={20} />, color: '#D97706', bg: '#FFFBEB' },
                { label: 'Tasa de éxito', value: `${metricsData.successRate}%`, icon: <Target size={20} />, color: '#7C3AED', bg: '#F5F3FF' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-xl p-4 sm:p-5 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: kpi.bg, color: kpi.color }}>
                      {kpi.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{kpi.label}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-slate-800">{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Pedidos por Repartidor: totales históricos y desglose por día */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-700">Pedidos por Repartidor</h3>
                  <p className="text-xs text-slate-400">
                    {driverView === 'total'
                      ? 'Totales históricos (todas las fechas)'
                      : 'Entregados por día · según el rango seleccionado arriba'}
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start">
                  {([['total', 'Total'], ['daily', 'Por día']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDriverView(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        driverView === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {driverView === 'total' ? (
                driverTotals.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Aún no hay pedidos asignados a repartidores.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="py-2 pr-3 font-semibold">Repartidor</th>
                          <th className="py-2 px-3 font-semibold text-right">Entregados</th>
                          <th className="py-2 px-3 font-semibold text-right">Asignados</th>
                          <th className="py-2 px-3 font-semibold text-right">Cancelados</th>
                          <th className="py-2 px-3 font-semibold text-right">En curso</th>
                          <th className="py-2 px-3 font-semibold text-right">Tiempo prom.</th>
                          <th className="py-2 pl-3 font-semibold text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverTotals.map(row => (
                          <tr key={row.driverId} className="border-b border-slate-50 last:border-0">
                            <td className="py-2.5 pr-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-700">{row.name}</span>
                              {row.isDeleted && <span className="ml-2 text-[10px] font-bold text-slate-400">(Baja)</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{row.delivered}</td>
                            <td className="py-2.5 px-3 text-right text-slate-600">{row.assigned}</td>
                            <td className="py-2.5 px-3 text-right text-red-500">{row.cancelled}</td>
                            <td className="py-2.5 px-3 text-right text-amber-600">{row.inProgress}</td>
                            <td className="py-2.5 px-3 text-right text-slate-500">{row.avgTime} min</td>
                            <td className="py-2.5 pl-3 text-right text-slate-700">S/ {row.revenue.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                driverDaily.days.length === 0 || driverDailyColumns.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sin entregas registradas en el rango seleccionado.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="py-2 pr-3 font-semibold">Día</th>
                          {driverDailyColumns.map(r => (
                            <th key={r.driverId} className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                              {r.name.split(' ')[0]}
                            </th>
                          ))}
                          <th className="py-2 pl-3 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {driverDaily.days.map(day => {
                          const inner = driverDaily.byDay.get(day)!;
                          const dayTotal = [...inner.values()].reduce((a, b) => a + b, 0);
                          return (
                            <tr key={day} className="border-b border-slate-50 last:border-0">
                              <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap capitalize">
                                {new Date(`${day}T00:00:00`).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' })}
                              </td>
                              {driverDailyColumns.map(r => {
                                const value = inner.get(r.driverId) ?? 0;
                                return (
                                  <td key={r.driverId} className={`py-2.5 px-3 text-right ${value > 0 ? 'font-semibold text-slate-700' : 'text-slate-300'}`}>
                                    {value}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 pl-3 text-right font-bold text-indigo-600">{dayTotal}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Driver performance & Plan summary */}
            {currentSubscription && (
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm text-slate-700">Consumo del Plan de Servicio</h3>
                  <button
                    type="button"
                    onClick={() => setAdminTab('billing')}
                    className={`text-xs font-black tracking-wider px-2.5 py-1 rounded-lg ${
                      snapshot.plan === 'ENTERPRISE' ? 'bg-amber-100 text-amber-700' :
                      snapshot.plan === 'GROWTH' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-indigo-100 text-indigo-700'
                    }`}
                  >{snapshot.planLabel}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Despachos este mes</span>
                      <span className="font-bold text-slate-700">{snapshot.ordersThisMonth} / {snapshot.maxOrders.toLocaleString('es-PE')}</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(snapshot.usagePercent, 100)}%`,
                          backgroundColor: snapshot.quotaState === 'exhausted' ? '#DC2626' : snapshot.quotaState === 'warning' ? '#D97706' : '#4F46E5',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-500">Repartidores activos</span>
                      <span className="font-bold text-slate-700">{activeDriverCount} / {snapshot.maxDrivers}</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min((activeDriverCount / Math.max(1, snapshot.maxDrivers)) * 100, 100)}%`,
                          backgroundColor: activeDriverCount > snapshot.maxDrivers ? '#DC2626' : '#4F46E5',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: SUSCRIPCIÓN Y FACTURACIÓN ================= */}
        {adminTab === 'billing' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in">
            <BillingPanel
              tenant={currentRestaurant}
              subscription={currentSubscription}
              snapshot={snapshot}
              transactions={billingHistory}
              onSubscriptionUpdated={handleSubscriptionUpdated}
            />
          </div>
        )}

        {/* ================= TAB 6: CONFIGURACIÓN DEL NEGOCIO ================= */}
        {adminTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 animate-fade-in">
            <BusinessSettingsPanel
              key={currentRestaurant.id}
              tenant={currentRestaurant}
              onUpdated={(nextTenant) => setCurrentRestaurant(nextTenant)}
            />
          </div>
        )}

      </main>

      {/* ================= MODAL: NUEVO DESPACHO MANUAL ================= */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle size={20} className="text-indigo-600" />
                <h3 className="font-bold text-lg text-slate-800">Nuevo Despacho Manual</h3>
              </div>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateManualDispatch} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase">Destinatario *</label>
                  <input
                    className="form-input"
                    placeholder="Nombre y Apellido"
                    value={manualForm.customer_name}
                    onChange={e => setManualForm(f => ({ ...f, customer_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase">Teléfono *</label>
                  <input
                    className="form-input"
                    placeholder="999 999 999"
                    value={manualForm.customer_phone}
                    onChange={e => setManualForm(f => ({ ...f, customer_phone: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Dirección de Entrega *</label>
                <input
                  className="form-input"
                  placeholder="Av. Ejemplo 123, Distrito"
                  value={manualForm.delivery_address}
                  onChange={e => setManualForm(f => ({ ...f, delivery_address: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase">Referencia</label>
                  <input
                    className="form-input"
                    placeholder="Dpto, puerta, timbre..."
                    value={manualForm.delivery_reference}
                    onChange={e => setManualForm(f => ({ ...f, delivery_reference: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label text-xs font-semibold uppercase">Monto Total (S/)</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    placeholder="0.00"
                    value={manualForm.total_amount}
                    onChange={e => setManualForm(f => ({ ...f, total_amount: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Descripción del Paquete / Encomienda</label>
                <input
                  className="form-input"
                  placeholder="Ej. Paquete de libros / Documentos / Caja sellada"
                  value={manualForm.item_description}
                  onChange={e => setManualForm(f => ({ ...f, item_description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Instrucciones de Despacho (Opcional)</label>
                <input
                  className="form-input"
                  placeholder="Ej. Tocar timbre 4B, llamar antes de llegar"
                  value={manualForm.notes}
                  onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingManual || !canCreateOrders}
                  className="btn btn-indigo flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingManual ? 'Creando...' : 'Crear Despacho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: VALIDAR PIN DE ENTREGA ================= */}
      {pinModalOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-400 flex items-center justify-center mx-auto text-amber-700">
              <ShieldCheck size={30} />
            </div>

            <div>
              <h3 className="font-bold text-lg text-slate-800">Confirmar Entrega con PIN</h3>
              <p className="text-xs text-slate-500 mt-1">
                Ingrese el código PIN de 4 dígitos proporcionado por el destinatario para confirmar la entrega de la orden <strong className="text-slate-800">#{pinModalOrder.order_number}</strong>:
              </p>
            </div>

            <form onSubmit={handleConfirmPinDelivery} className="space-y-4">
              <input
                type="text"
                maxLength={4}
                autoFocus
                placeholder="0000"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-3xl tracking-[0.3em] font-mono font-black py-3 rounded-xl border-2 border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                required
              />

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPinModalOrder(null)}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={validatingPin || pinInput.length !== 4}
                  className="btn btn-indigo flex-1 text-xs font-bold"
                >
                  {validatingPin ? 'Validando...' : 'Validar y Entregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CANCELACIÓN ESTRUCTURADA ================= */}
      {cancelModalOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-red-600 border-b border-slate-100 pb-3">
              <AlertTriangle size={22} />
              <h3 className="font-bold text-base text-slate-900">Cancelar Despacho #{cancelModalOrder.order_number}</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Seleccione el motivo de rechazo estructurado para notificar el cese del despacho al sistema de origen:
            </p>

            <div className="space-y-3">
              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Motivo Estructurado *</label>
                <select
                  className="form-input form-select"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value as CancellationReason)}
                >
                  {(Object.entries(CANCELLATION_REASONS) as [CancellationReason, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Detalles / Nota Opcional</label>
                <textarea
                  className="form-input text-xs"
                  rows={2}
                  placeholder="Detalles adicionales para auditoría..."
                  value={cancelNote}
                  onChange={e => setCancelNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="btn btn-secondary flex-1 text-xs"
              >
                Regresar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                disabled={cancelling}
                className="btn bg-red-600 hover:bg-red-700 text-white flex-1 text-xs font-bold"
              >
                {cancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: GENERAR NUEVA API KEY ================= */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-600 border-b border-slate-100 pb-3">
              <Key size={20} />
              <h3 className="font-bold text-base text-slate-900">Generar Clave API B2B</h3>
            </div>

            <form onSubmit={handleGenerateApiKey} className="space-y-4">
              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">Nombre Identificador</label>
                <input
                  className="form-input"
                  placeholder="Ej. Servidor Producción Shopify / ERP"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  required
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-tight">
                Se generará una clave secreta <code className="bg-slate-100 px-1 font-mono">dtk_live_...</code> con acceso de escritura para despachos.
              </p>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowNewKeyModal(false)} className="btn btn-secondary flex-1 text-xs">
                  Cancelar
                </button>
                <button type="submit" disabled={generatingKey} className="btn btn-indigo flex-1 text-xs font-bold">
                  {generatingKey ? 'Generando...' : 'Generar Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: MOSTRAR RAW API KEY RECIÉN CREADA ================= */}
      {rawKeyDisplay && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 border-b border-slate-100 pb-3">
              <CheckCircle size={22} />
              <h3 className="font-bold text-base text-slate-900">Clave API Generada</h3>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
              <strong>Importante:</strong> Copie esta clave ahora mismo. Por motivos de seguridad, no volverá a mostrarse en su totalidad.
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase text-slate-500">Token Secreto ({rawKeyDisplay.name})</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={rawKeyDisplay.rawKey}
                  className="form-input font-mono text-xs bg-slate-50 text-indigo-900 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyRawKey}
                  className="btn btn-indigo text-xs py-2 px-3 shrink-0 flex items-center gap-1"
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRawKeyDisplay(null)}
                className="btn btn-secondary w-full text-xs font-bold"
              >
                He guardado mi clave de forma segura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ORDER DETAIL DRAWER ================= */}
      {selectedOrder && (
        <>
          <div className="drawer-overlay" onClick={() => setSelectedOrder(null)} />
          <div className="drawer-panel animate-slide-in">
            <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg sm:text-xl text-slate-800">Despacho #{selectedOrder.order_number}</h3>
                  <span className="text-xs font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                    {selectedOrder.origin_system || 'API'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(selectedOrder.created_at).toLocaleString('es-PE')}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
              {/* Security PIN Banner */}
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={20} className="text-amber-700 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">PIN</span>
                    <span className="text-xs text-amber-700">Requerido para entregar</span>
                  </div>
                </div>
                <span className="font-mono text-xl font-black tracking-widest text-amber-950 bg-white border border-amber-300 px-3 py-1 rounded-lg">
                  {selectedOrder.pin_code || (selectedOrder.notes?.match(/\[PIN:\s*(\d{4})\]/)?.[1]) || '1910'}
                </span>
              </div>

              {/* Status Action */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className={`badge badge-${selectedOrder.status} text-xs px-3 py-1`}>
                    {STATUS_CONFIG[selectedOrder.status].icon}
                    {STATUS_CONFIG[selectedOrder.status].label}
                  </span>
                  <span className="font-bold text-slate-800 text-sm">S/ {selectedOrder.total_amount.toFixed(2)}</span>
                </div>

                {selectedOrder.cancellation_reason && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                    <strong>Motivo de Cancelación:</strong> {selectedOrder.cancellation_reason}
                    {selectedOrder.cancelled_by && (
                      <span className="block mt-1 text-[10px] font-semibold text-red-600 uppercase tracking-wide">
                        Cancelado por: {selectedOrder.cancelled_by}
                      </span>
                    )}
                  </div>
                )}

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
                  {readOnly && (
                    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
                      Suscripción vencida: la asignación está bloqueada. Puedes finalizar pedidos en curso.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {drivers.filter(d => !d.deleted_at).map(d => (
                      <button
                        key={d.id}
                        onClick={() => assignDriver(selectedOrder.id, d.id)}
                        disabled={!d.is_active || readOnly}
                        className={`p-3 rounded-lg border text-left transition-all flex justify-between items-center disabled:opacity-50 disabled:cursor-not-allowed ${
                          selectedOrder.driver_id === d.id
                            ? 'border-indigo-600 bg-indigo-50 font-semibold'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-sm text-slate-800">{d.name}{!d.is_active && <span className="text-[10px] font-bold text-slate-400"> (Inactivo)</span>}</p>
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
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Destinatario</h4>
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

              {/* Package Items */}
              {selectedOrder.order_items && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Contenido del Despacho</h4>
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
            <div className="p-4 sm:p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-800">Rastreo #{trackingDrawerOrder.order_number}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{trackingDrawerOrder.customer_name}</p>
              </div>
              <button onClick={() => setTrackingDrawerOrder(null)} className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div ref={trackingMapRef} className="w-full" style={{ height: '240px' }} id="drawer-tracking-map" />

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 sm:py-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageSquare size={15} /> Enviar tracking por WhatsApp
                </button>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
