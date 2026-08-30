'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  ShoppingBag, MapPin, Phone, X, Plus, Minus,
  Loader2, CheckCircle, ArrowLeft, ChevronLeft,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Restaurant, Product, CartItem, PaymentMethod } from '@/lib/supabase/types';

interface MenuClientProps {
  restaurant: Restaurant;
  products: Product[];
}

type CheckoutStep = 'home' | 'category' | 'checkout' | 'success';

interface OrderForm {
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string;
  payment_method: PaymentMethod;
  cash_amount_change: string;
  notes: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
};

export default function MenuClient({ restaurant: initialRestaurant, products: initialProducts }: MenuClientProps) {
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant>(initialRestaurant);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<CheckoutStep>('home');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Sync when initial props change
  useEffect(() => {
    setCurrentRestaurant(initialRestaurant);
  }, [initialRestaurant]);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  // Realtime subscription for restaurant updates (e.g. is_open toggle)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-restaurant-${initialRestaurant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurants',
        filter: `id=eq.${initialRestaurant.id}`,
      }, payload => {
        if (payload.new) {
          setCurrentRestaurant(payload.new as Restaurant);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialRestaurant.id]);

  // Realtime subscription for products table (instant dish activation/deactivation/updates)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-products-${initialRestaurant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products',
        filter: `restaurant_id=eq.${initialRestaurant.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          const inserted = payload.new as Product;
          setProducts(prev => {
            if (prev.some(p => p.id === inserted.id)) return prev;
            return [...prev, inserted];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Product;
          setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id: string }).id;
          setProducts(prev => prev.filter(p => p.id !== deletedId));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialRestaurant.id]);

  const restaurant = currentRestaurant;

  const [form, setForm] = useState<OrderForm>({
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    delivery_reference: '',
    payment_method: 'EFECTIVO',
    cash_amount_change: '',
    notes: '',
  });

  // Calculate day of week (1=Monday ... 7=Sunday)
  const todayIso = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  }, []);

  // Filter products by available_days (if empty/null, always available)
  const activeDayProducts = useMemo(() => {
    return products.filter(p => {
      if (!p.available_days || p.available_days.length === 0) return true;
      return p.available_days.includes(todayIso);
    });
  }, [products, todayIso]);

  const grouped = useMemo(() => {
    return activeDayProducts.reduce<Record<string, Product[]>>((acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    }, {});
  }, [activeDayProducts]);

  const categories = Object.keys(grouped);

  const cartTotal = useMemo(() =>
    cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(() =>
    cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast.success(`${product.name} agregado al pedido`);
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  }, []);

  const getGPSLocation = async () => {
    setIsLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setLocation({ lat, lng });

      // Reverse geocoding via OpenStreetMap Nominatim
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.address) {
            const addr = data.address;
            const road = addr.road || addr.pedestrian || addr.street || '';
            const houseNumber = addr.house_number || '';
            const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';
            const city = addr.city || addr.town || '';

            const parts: string[] = [];
            if (road) parts.push(houseNumber ? `${road} ${houseNumber}` : road);
            if (suburb) parts.push(suburb);
            else if (city) parts.push(city);

            const readableAddress = parts.join(', ') || data.display_name;
            if (readableAddress) {
              setForm(f => ({ ...f, delivery_address: readableAddress }));
            }
          }
        }
      } catch (_) {}

      toast.success('Ubicación capturada y dirección autocompletada');
    } catch {
      toast.error('No se pudo obtener el GPS. Puedes escribir tu dirección manualmente.');
    } finally {
      setIsLocating(false);
    }
  };

  const geocodeAddress = async (addressText: string): Promise<{ lat: number; lng: number }> => {
    try {
      const query = encodeURIComponent(`${addressText}, Peru`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          return {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          };
        }
      }
    } catch (_) {}
    return { lat: -12.0464, lng: -77.0428 };
  };

  // Debounced live geocoding as the user types their address
  useEffect(() => {
    if (!form.delivery_address || form.delivery_address.trim().length < 5) return;
    const timer = setTimeout(async () => {
      const coords = await geocodeAddress(form.delivery_address);
      setLocation(coords);
    }, 900);
    return () => clearTimeout(timer);
  }, [form.delivery_address]);

  // Handle map click or pin drag to reverse geocode and update address input
  const handleMapPick = useCallback(async (lat: number, lng: number) => {
    setLocation({ lat, lng });
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.pedestrian || addr.street || '';
          const houseNumber = addr.house_number || '';
          const suburb = addr.suburb || addr.neighbourhood || addr.city_district || '';
          const city = addr.city || addr.town || '';

          const parts: string[] = [];
          if (road) parts.push(houseNumber ? `${road} ${houseNumber}` : road);
          if (suburb) parts.push(suburb);
          else if (city) parts.push(city);

          const readableAddress = parts.join(', ') || data.display_name;
          if (readableAddress) {
            setForm(f => ({ ...f, delivery_address: readableAddress }));
          }
        }
      }
    } catch (_) {}
  }, []);

  const handleSubmitOrder = async () => {
    if (!restaurant.is_open) {
      toast.error('El restaurante está temporalmente cerrado y no puede recibir nuevos pedidos.');
      return;
    }
    if (!form.customer_name || !form.customer_phone || !form.delivery_address) {
      toast.error('Complete nombre, teléfono y dirección de entrega');
      return;
    }
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      // Resolve coordinates (use captured GPS or geocode typed address)
      let finalLat = location?.lat;
      let finalLng = location?.lng;

      if (!finalLat || !finalLng) {
        const geocoded = await geocodeAddress(form.delivery_address);
        finalLat = geocoded.lat;
        finalLng = geocoded.lng;
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          delivery_address: form.delivery_address,
          delivery_reference: form.delivery_reference || null,
          delivery_lat: finalLat,
          delivery_lng: finalLng,
          payment_method: form.payment_method,
          cash_amount_change: form.payment_method === 'EFECTIVO' && form.cash_amount_change
            ? parseFloat(form.cash_amount_change)
            : null,
          total_amount: cartTotal,
          notes: form.notes || null,
          status: 'RECIBIDO',
        })
        .select()
        .single();

      if (orderError || !order) throw orderError;

      const items = cart.map(item => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      setOrderId(order.id);
      setStep('success');
    } catch (err) {
      console.error(err);
      toast.error('Error al procesar el pedido. Intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ===== SUCCESS SCREEN ===== */
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-secondary)', fontFamily: 'Inter, sans-serif' }}>
        <div className="card p-8 max-w-md w-full text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: `${restaurant.brand_color}20` }}>
            <CheckCircle size={40} style={{ color: restaurant.brand_color }} />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Pedido recibido
          </h1>
          <p className="mb-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {restaurant.name} ha recibido su pedido. Recibirá un enlace de seguimiento cuando el repartidor esté en camino.
          </p>
          <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--gray-100)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Total a pagar</p>
            <p className="text-3xl font-bold" style={{ color: restaurant.brand_color }}>
              S/ {cartTotal.toFixed(2)}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{PAYMENT_LABELS[form.payment_method]}</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Orden #{orderId?.slice(-8).toUpperCase()}</p>
        </div>
      </div>
    );
  }

  const categoryItems = activeCategory ? grouped[activeCategory] ?? [] : [];

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#F9FAFB', minHeight: '100vh' }}>

      {/* ===== HEADER ===== */}
      <header className="bg-white sticky top-0 z-40 shadow-xs" style={{ borderBottom: '1px solid var(--gray-200)' }}>
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-12 h-[62px] sm:h-[75px] flex items-center justify-between">

          {/* Logo & Name */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {step !== 'home' && (
              <button
                onClick={() => setStep(step === 'category' ? 'home' : 'category')}
                className="btn btn-ghost btn-sm p-1.5 sm:p-2 shrink-0"
                id="btn-back"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {restaurant.logo_url ? (
              <Image
                src={restaurant.logo_url}
                alt={restaurant.name}
                width={36}
                height={36}
                className="rounded-full object-cover shrink-0 w-9 h-9 sm:w-11 sm:h-11"
                style={{ border: `2px solid ${restaurant.brand_color}` }}
              />
            ) : (
              <div
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg shrink-0"
                style={{ background: restaurant.brand_color }}
              >
                {restaurant.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-xs sm:text-sm leading-tight truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none" style={{ color: 'var(--text-primary)' }}>
                {restaurant.name}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? 'bg-emerald-500' : 'bg-red-400'} pulse-dot`} />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {restaurant.is_open ? 'Abierto ahora' : 'Cerrado'}
                </span>
              </div>
            </div>
          </div>

          {/* Cart button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-2 cursor-pointer relative group p-2"
            id="cart-button"
          >
            <ShoppingBag size={20} style={{ color: restaurant.brand_color }} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider hidden sm:block" style={{ color: 'var(--text-secondary)' }}>
              Mi Pedido
            </span>
            {cartCount > 0 && (
              <span
                className="absolute -top-1 -right-1 sm:-left-1.5 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center text-black"
                style={{ background: 'var(--brand-accent)' }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Closed Store Alert Banner */}
      {!restaurant.is_open && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 text-amber-900 sticky top-[62px] sm:top-[75px] z-30 shadow-xs">
          <div className="max-w-[1300px] mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 animate-ping" />
              <p className="text-xs sm:text-sm font-semibold leading-tight">
                <strong className="text-amber-950">Restaurante Cerrado:</strong> No estamos recibiendo pedidos en línea en este momento.
              </p>
            </div>
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone}`}
                className="text-xs font-bold text-amber-900 underline hover:text-amber-950 hidden sm:inline shrink-0"
              >
                Llamar: {restaurant.phone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* ===== HOME VIEW ===== */}
      {step === 'home' && (
        <>
          {/* Hero */}
          <section
            className="relative w-full flex items-center h-[200px] sm:h-[300px]"
            style={{ background: '#1a1a2e' }}
          >
            {restaurant.cover_image_url && (
              <Image
                src={restaurant.cover_image_url}
                alt={restaurant.name}
                fill
                className="object-cover"
                style={{ opacity: 0.55 }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%)' }}
            />
            <div className="relative max-w-[1300px] w-full mx-auto px-4 sm:px-6 lg:px-12 flex justify-end">
              <div className="text-right max-w-lg">
                <p className="text-xs sm:text-sm uppercase tracking-widest mb-1.5 font-bold" style={{ color: restaurant.brand_color }}>
                  {restaurant.is_open ? '● Abierto ahora' : '○ Cerrado temporalmente'}
                </p>
                <h2 className="text-white text-2xl sm:text-4xl lg:text-5xl font-black uppercase leading-tight mb-2 drop-shadow-lg">
                  {restaurant.name}
                </h2>
                {restaurant.address && (
                  <p className="text-white/80 text-xs sm:text-sm truncate">{restaurant.address}</p>
                )}
              </div>
            </div>
          </section>

          {/* Category grid */}
          <section className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12 pb-28">
            {categories.length === 0 ? (
              <div className="text-center py-16">
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No hay platos disponibles hoy</p>
                {restaurant.phone && (
                  <a href={`tel:${restaurant.phone}`} className="btn btn-primary mt-4" style={{ background: restaurant.brand_color }}>
                    <Phone size={16} /> {restaurant.phone}
                  </a>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                {categories.map(cat => {
                  const sample = grouped[cat].find(p => p.image_url)?.image_url;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setStep('category'); }}
                      className="relative h-44 sm:h-64 rounded-xl sm:rounded-2xl overflow-hidden group text-left shadow-xs hover:shadow-xl transition-all"
                      style={{ background: '#1a1a1a' }}
                      id={`cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {sample ? (
                        <Image src={sample} alt={cat} fill className="object-cover group-hover:scale-105 transition duration-500"
                          style={{ opacity: 0.65 }} />
                      ) : (
                        <div style={{ background: `${restaurant.brand_color}40` }} className="absolute inset-0" />
                      )}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)' }} />
                      <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6">
                        <h3 className="text-white text-lg sm:text-xl font-bold uppercase tracking-wide">{cat}</h3>
                        <p className="text-white/70 text-xs sm:text-sm">{grouped[cat].length} {grouped[cat].length === 1 ? 'plato' : 'platos'}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="border-t-4 py-8 px-6 text-center" style={{ background: '#1a1a1a', borderColor: restaurant.brand_color }}>
            <div className="max-w-[1300px] mx-auto flex flex-col sm:flex-row justify-between items-center text-xs text-gray-400 gap-2">
              <p>&copy; {new Date().getFullYear()} {restaurant.name} &mdash; Todos los derechos reservados.</p>
              <p>Powered by Delivery Tracker SaaS</p>
            </div>
          </footer>
        </>
      )}

      {/* ===== CATEGORY VIEW ===== */}
      {step === 'category' && activeCategory && (
        <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-10 pb-32">
          {/* Category Chips Navigator */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
                style={activeCategory === cat ? { background: restaurant.brand_color } : {}}
              >
                {cat} ({grouped[cat]?.length || 0})
              </button>
            ))}
          </div>

          <h2 className="text-xl sm:text-3xl font-black uppercase text-center tracking-wider mb-6 sm:mb-8" style={{ color: 'var(--text-primary)' }}>
            {activeCategory}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-5">
            {categoryItems.map(product => {
              const cartItem = cart.find(i => i.product.id === product.id);
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl sm:rounded-2xl border overflow-hidden flex flex-col animate-fade-in transition-all"
                  style={{
                    borderColor: 'var(--gray-100)',
                    boxShadow: 'var(--shadow-sm)',
                    opacity: product.is_available ? 1 : 0.65,
                  }}
                >
                  <div className="h-36 sm:h-44 overflow-hidden bg-gray-100 relative">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: `${restaurant.brand_color}15` }}>
                        <span className="text-3xl sm:text-4xl font-black" style={{ color: `${restaurant.brand_color}40` }}>
                          {product.name[0]}
                        </span>
                      </div>
                    )}
                    {!product.is_available && (
                      <span className="absolute top-2.5 right-2.5 bg-slate-900/80 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-xs backdrop-blur-xs">
                        Agotado
                      </span>
                    )}
                  </div>
                  <div className="p-3.5 sm:p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <h4 className="font-bold text-sm sm:text-base leading-tight" style={{ color: 'var(--text-primary)' }}>
                        {product.name}
                      </h4>
                      {!product.is_available && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                          Agotado
                        </span>
                      )}
                    </div>
                    {product.description && (
                      <p className="text-xs mb-3 line-clamp-2 flex-1 text-slate-500">
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
                      <span className="text-base sm:text-xl font-black" style={{ color: 'var(--text-primary)' }}>
                        S/ {product.price.toFixed(2)}
                      </span>
                      {!product.is_available ? (
                        <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200">
                          Agotado
                        </span>
                      ) : cartItem ? (
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border border-slate-200 text-slate-700 active:bg-slate-100"
                            id={`decrease-${product.id}`}
                          >
                            <Minus size={12} />
                          </button>
                          <span className="font-bold w-4 text-center text-xs sm:text-sm">{cartItem.quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white active:opacity-90"
                            style={{ background: restaurant.brand_color }}
                            id={`increase-${product.id}`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          className="flex items-center gap-1 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold text-white active:scale-95 transition-all shadow-xs"
                          style={{ background: restaurant.brand_color }}
                          id={`add-${product.id}`}
                        >
                          <Plus size={13} /> Agregar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating Bottom Cart Bar on Mobile */}
      {cartCount > 0 && !isCartOpen && step !== 'checkout' && (
        <div className="fixed bottom-4 inset-x-3.5 z-40 sm:hidden animate-slide-up">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3 px-4 rounded-2xl text-white font-bold flex items-center justify-between shadow-xl active:scale-[0.98] transition-all"
            style={{ background: restaurant.brand_color }}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-white/25 text-white font-black text-xs flex items-center justify-center">
                {cartCount}
              </span>
              <span className="text-xs font-semibold">Ver mi pedido</span>
            </div>
            <span className="text-xs font-black">S/ {cartTotal.toFixed(2)} →</span>
          </button>
        </div>
      )}

      {/* ===== CHECKOUT VIEW ===== */}
      {step === 'checkout' && (
        <div className="max-w-xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 pb-32 space-y-4 sm:space-y-5 animate-fade-in">
          <div className="flex items-center gap-2.5 sm:gap-3 mb-2 sm:mb-4">
            <button onClick={() => setStep('category')} className="btn btn-ghost btn-sm p-1.5 sm:p-2 text-xs sm:text-sm">
              <ArrowLeft size={16} /> Volver
            </button>
            <h2 className="font-bold text-lg sm:text-xl" style={{ color: 'var(--text-primary)' }}>Datos de entrega</h2>
          </div>

          {!restaurant.is_open && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-center shadow-xs">
              <span className="text-xs font-black uppercase tracking-wider block text-amber-950 mb-1">
                Restaurante Cerrado
              </span>
              <p className="text-xs text-amber-800 leading-tight">
                El restaurante ha pausado la recepción de nuevos pedidos en línea en este momento.
              </p>
            </div>
          )}

          {/* Order summary */}
          <div className="card p-3.5 sm:p-4">
            <h3 className="font-semibold mb-2.5 text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>
              Pedido ({cartCount} items)
            </h3>
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.product.id} className="flex justify-between text-xs sm:text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{item.quantity}x {item.product.name}</span>
                  <span className="font-medium">S/ {(item.product.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold text-xs sm:text-sm" style={{ borderColor: 'var(--border-color)' }}>
                <span>Total</span>
                <span style={{ color: restaurant.brand_color }}>S/ {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Personal data */}
          <div className="card p-3.5 sm:p-4 space-y-3.5 sm:space-y-4">
            <h3 className="font-semibold text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>Datos personales</h3>
            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input className="form-input" placeholder="Ej. Juan Garcia" value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} id="input-customer-name" />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp / Teléfono *</label>
              <input className="form-input" type="tel" placeholder="Ej. 987654321" value={form.customer_phone}
                onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} id="input-customer-phone" />
            </div>
          </div>

          {/* Address */}
          <div className="card p-3.5 sm:p-4 space-y-3.5 sm:space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>Dirección de entrega</h3>
              <span className="text-[11px] text-slate-400 font-medium">Manual o GPS</span>
            </div>

            <div className="form-group">
              <label className="form-label">Dirección completa *</label>
              <input
                className="form-input"
                placeholder="Ej. Av. Javier Prado Este 2465, San Borja"
                value={form.delivery_address}
                onChange={e => setForm(f => ({ ...f, delivery_address: e.target.value }))}
                id="input-address"
              />
            </div>

            <button
              type="button"
              onClick={getGPSLocation}
              disabled={isLocating}
              className="btn btn-secondary w-full text-[11px] sm:text-xs font-semibold py-2 sm:py-2.5 flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-100 transition-colors"
              id="btn-gps"
            >
              {isLocating ? (
                <><Loader2 size={14} className="animate-spin" /> Obteniendo coordenadas y dirección...</>
              ) : (
                <>
                  <MapPin size={14} style={{ color: location ? '#10B981' : restaurant.brand_color }} />
                  {location ? 'Ubicación GPS sincronizada' : 'Autocompletar con mi GPS actual'}
                </>
              )}
            </button>

            {/* Live Interactive Mini Map */}
            <DeliveryMiniMap
              location={location}
              brandColor={restaurant.brand_color}
              onPickLocation={handleMapPick}
            />

            <div className="form-group">
              <label className="form-label">Referencia (opcional)</label>
              <input
                className="form-input"
                placeholder="Ej. Frente al parque, dpto 302"
                value={form.delivery_reference}
                onChange={e => setForm(f => ({ ...f, delivery_reference: e.target.value }))}
                id="input-reference"
              />
            </div>
          </div>

          {/* Payment */}
          <div className="card p-3.5 sm:p-4 space-y-3.5 sm:space-y-4">
            <h3 className="font-semibold text-xs sm:text-sm" style={{ color: 'var(--text-primary)' }}>Método de pago</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['EFECTIVO', 'YAPE', 'PLIN'] as PaymentMethod[]).map(method => (
                <button key={method} onClick={() => setForm(f => ({ ...f, payment_method: method }))}
                  className="p-2.5 sm:p-3 rounded-xl border-2 text-center transition-all text-xs sm:text-sm font-bold"
                  style={{
                    borderColor: form.payment_method === method ? restaurant.brand_color : 'var(--border-color)',
                    background: form.payment_method === method ? `${restaurant.brand_color}10` : 'white',
                    color: form.payment_method === method ? restaurant.brand_color : 'var(--text-secondary)',
                  }}
                  id={`pay-${method.toLowerCase()}`}>
                  {PAYMENT_LABELS[method]}
                </button>
              ))}
            </div>
            {form.payment_method === 'EFECTIVO' && (
              <div className="form-group">
                <label className="form-label">Monto con el que paga</label>
                <input className="form-input" type="number" placeholder="Ej. 50" min={cartTotal}
                  value={form.cash_amount_change} onChange={e => setForm(f => ({ ...f, cash_amount_change: e.target.value }))}
                  id="input-cash" />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card p-3.5 sm:p-4">
            <div className="form-group">
              <label className="form-label">Notas adicionales (opcional)</label>
              <textarea className="form-input" rows={2} placeholder="Instrucciones especiales"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} id="input-notes" />
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM CTA ===== */}
      {(step === 'category' || step === 'checkout') && (
        <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 border-t z-30"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', borderColor: 'var(--border-color)' }}>
          <div className="max-w-5xl mx-auto">
            {step === 'category' ? (
              <button
                onClick={() => {
                  if (!restaurant.is_open) {
                    toast.error('El restaurante está temporalmente cerrado y no recibe pedidos por el momento.');
                    return;
                  }
                  if (cart.length === 0) { toast.error('Agregue al menos un producto'); return; }
                  setStep('checkout');
                }}
                className="btn btn-primary btn-lg btn-full"
                style={{ background: !restaurant.is_open ? '#64748B' : restaurant.brand_color }}
                disabled={cart.length === 0 || !restaurant.is_open}
                id="btn-go-checkout"
              >
                <ShoppingBag size={18} />
                {!restaurant.is_open ? 'Restaurante Cerrado (Pedidos pausados)' : `Continuar (${cartCount} items — S/ ${cartTotal.toFixed(2)})`}
              </button>
            ) : (
              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting || !restaurant.is_open}
                className="btn btn-lg btn-full text-white font-bold"
                style={{ background: !restaurant.is_open ? '#64748B' : '#15803D' }}
                id="btn-confirm-order"
              >
                {isSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> Procesando...</>
                ) : !restaurant.is_open ? (
                  <>Restaurante Cerrado</>
                ) : (
                  <>Confirmar Pedido &mdash; S/ {cartTotal.toFixed(2)}</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== CART DRAWER ===== */}
      {isCartOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsCartOpen(false)} />
          <div className="fixed top-0 right-0 w-full sm:w-96 h-screen bg-white shadow-2xl z-50 flex flex-col animate-slide-in">

            {/* Cart header */}
            <div className="flex items-center justify-between p-5" style={{ background: restaurant.brand_color }}>
              <h2 className="font-black text-xl text-white uppercase tracking-wider">Tu Pedido</h2>
              <button onClick={() => setIsCartOpen(false)} className="text-white/80 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* Cart items */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              {cart.length === 0 ? (
                <p className="text-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>Tu carrito está vacío.</p>
              ) : (
                cart.map(item => (
                  <div key={item.product.id} className="flex items-center justify-between gap-3 border-b pb-3"
                    style={{ borderColor: 'var(--gray-100)' }}>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.product.name}</h4>
                      <p className="text-sm font-bold" style={{ color: restaurant.brand_color }}>
                        S/ {(item.product.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs"
                        style={{ borderColor: 'var(--border-color)' }}>
                        <Minus size={12} />
                      </button>
                      <span className="font-bold w-5 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-white"
                        style={{ background: restaurant.brand_color }}>
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart footer */}
            <div className="p-5" style={{ borderTop: `3px solid var(--brand-accent)`, background: 'var(--gray-50)' }}>
              <div className="flex justify-between font-black text-lg mb-4" style={{ color: restaurant.brand_color }}>
                <span>Subtotal:</span>
                <span>S/ {cartTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={() => {
                  if (!restaurant.is_open) {
                    toast.error('El restaurante está temporalmente cerrado. No se reciben pedidos.');
                    return;
                  }
                  setIsCartOpen(false);
                  setStep('checkout');
                }}
                className="btn btn-lg btn-full text-white font-bold"
                style={{ background: !restaurant.is_open ? '#64748B' : '#15803D' }}
                disabled={cart.length === 0 || !restaurant.is_open}
                id="btn-cart-checkout"
              >
                {!restaurant.is_open ? 'Restaurante Cerrado' : 'Continuar al Pago'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeliveryMiniMap({
  location,
  brandColor,
  onPickLocation,
}: {
  location: { lat: number; lng: number } | null;
  brandColor: string;
  onPickLocation: (lat: number, lng: number) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then(L => {
      if (!mapContainerRef.current) return;

      const initialLat = location?.lat ?? -12.0464;
      const initialLng = location?.lng ?? -77.0428;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([initialLat, initialLng], location ? 16 : 13);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const customIcon = L.divIcon({
        className: 'custom-delivery-pin',
        html: `
          <div style="
            background: ${brandColor || '#4F46E5'};
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 3px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
          ">
            <div style="
              width: 10px;
              height: 10px;
              background: white;
              border-radius: 50%;
              transform: rotate(45deg);
            "></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([initialLat, initialLng], {
        icon: customIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onPickLocation(pos.lat, pos.lng);
      });

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        onPickLocation(e.latlng.lat, e.latlng.lng);
      });

      leafletMapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      if (leafletMapRef.current) {
        (leafletMapRef.current as { remove: () => void }).remove();
        leafletMapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!leafletMapRef.current || !markerRef.current || !location) return;
    const map = leafletMapRef.current as { setView: (coords: [number, number], zoom: number, options?: { animate: boolean }) => void };
    const marker = markerRef.current as { setLatLng: (coords: [number, number]) => void };

    marker.setLatLng([location.lat, location.lng]);
    map.setView([location.lat, location.lng], 16, { animate: true });
  }, [location]);

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
          <MapPin size={14} style={{ color: brandColor || '#4F46E5' }} />
          Punto exacto de entrega en mapa
        </span>
        <span className="text-slate-400 text-[11px]">
          Mueve el pin o haz clic
        </span>
      </div>
      <div
        ref={mapContainerRef}
        className="w-full h-44 rounded-xl overflow-hidden border border-slate-200 shadow-inner relative z-0"
      />
    </div>
  );
}
