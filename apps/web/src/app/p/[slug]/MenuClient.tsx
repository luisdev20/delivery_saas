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

export default function MenuClient({ restaurant, products }: MenuClientProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<CheckoutStep>('home');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [form, setForm] = useState<OrderForm>({
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    delivery_reference: '',
    payment_method: 'EFECTIVO',
    cash_amount_change: '',
    notes: '',
  });

  const grouped = useMemo(() => {
    return products.reduce<Record<string, Product[]>>((acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    }, {});
  }, [products]);

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
      <header className="bg-white sticky top-0 z-40 shadow-sm" style={{ borderBottom: '1px solid var(--gray-200)' }}>
        <div className="max-w-[1300px] mx-auto px-6 lg:px-12 h-[75px] flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            {step !== 'home' && (
              <button
                onClick={() => setStep(step === 'category' ? 'home' : 'category')}
                className="btn btn-ghost btn-sm"
                id="btn-back"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {restaurant.logo_url ? (
              <Image
                src={restaurant.logo_url}
                alt={restaurant.name}
                width={42}
                height={42}
                className="rounded-full object-cover"
                style={{ border: `2px solid ${restaurant.brand_color}` }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ background: restaurant.brand_color }}
              >
                {restaurant.name[0]}
              </div>
            )}
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
                {restaurant.name}
              </p>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? 'bg-green-500' : 'bg-red-400'} pulse-dot`} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {restaurant.is_open ? 'Abierto' : 'Cerrado'}
                </span>
              </div>
            </div>
          </div>

          {/* Cart button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex items-center gap-2 cursor-pointer relative group"
            id="cart-button"
          >
            <ShoppingBag size={22} style={{ color: restaurant.brand_color }} className="group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold uppercase tracking-wider hidden sm:block" style={{ color: 'var(--text-secondary)' }}>
              Mi Pedido
            </span>
            {cartCount > 0 && (
              <span
                className="absolute -top-1.5 -left-1.5 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center text-black"
                style={{ background: 'var(--brand-accent)' }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ===== HOME VIEW ===== */}
      {step === 'home' && (
        <>
          {/* Hero */}
          <section
            className="relative w-full flex items-center"
            style={{ height: '320px', background: '#1a1a2e' }}
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
              style={{ background: 'linear-gradient(to right, transparent 40%, rgba(0,0,0,0.75))' }}
            />
            <div className="relative max-w-[1300px] w-full mx-auto px-6 lg:px-12 flex justify-end">
              <div className="text-right">
                <p className="text-sm uppercase tracking-widest mb-2" style={{ color: restaurant.brand_color }}>
                  {restaurant.is_open ? 'Abierto ahora' : 'Cerrado'}
                </p>
                <h2 className="text-white text-5xl font-black uppercase leading-none mb-4 drop-shadow-lg">
                  {restaurant.name}
                </h2>
                <p className="text-white/70 text-sm">{restaurant.address}</p>
              </div>
            </div>
          </section>

          {/* Category grid */}
          <section className="max-w-[1300px] mx-auto px-6 lg:px-12 py-12 pb-28">
            {categories.length === 0 ? (
              <div className="text-center py-16">
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No hay platos disponibles hoy</p>
                <a href={`tel:${restaurant.phone}`} className="btn btn-primary mt-4" style={{ background: restaurant.brand_color }}>
                  <Phone size={16} /> {restaurant.phone}
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map(cat => {
                  const sample = grouped[cat].find(p => p.image_url)?.image_url;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCategory(cat); setStep('category'); }}
                      className="relative h-64 rounded-2xl overflow-hidden group text-left shadow-sm hover:shadow-xl transition-all"
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
                      <div className="absolute bottom-6 left-6 right-6">
                        <h3 className="text-white text-xl font-bold uppercase tracking-wide">{cat}</h3>
                        <p className="text-white/60 text-sm">{grouped[cat].length} platos</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Footer */}
          <footer className="border-t-4 py-8 px-6 text-center" style={{ background: '#1a1a1a', borderColor: restaurant.brand_color }}>
            <div className="max-w-[1300px] mx-auto flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 gap-2">
              <p>&copy; {new Date().getFullYear()} {restaurant.name} &mdash; Todos los derechos reservados.</p>
              <p>Powered by Delivery Tracker SaaS</p>
            </div>
          </footer>
        </>
      )}

      {/* ===== CATEGORY VIEW ===== */}
      {step === 'category' && activeCategory && (
        <div className="max-w-[1300px] mx-auto px-6 lg:px-12 py-10 pb-32">
          <h2 className="text-3xl font-black uppercase text-center tracking-wider mb-8" style={{ color: 'var(--text-primary)' }}>
            {activeCategory}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {categoryItems.map(product => {
              const cartItem = cart.find(i => i.product.id === product.id);
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-2xl border overflow-hidden flex flex-col animate-fade-in"
                  style={{ borderColor: 'var(--gray-100)', boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-lg)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
                >
                  <div className="h-44 overflow-hidden bg-gray-100 relative">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: `${restaurant.brand_color}15` }}>
                        <span className="text-4xl font-black" style={{ color: `${restaurant.brand_color}40` }}>
                          {product.name[0]}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h4 className="font-bold text-base leading-tight mb-1" style={{ color: 'var(--text-primary)' }}>
                      {product.name}
                    </h4>
                    {product.description && (
                      <p className="text-xs mb-3 line-clamp-2 flex-1" style={{ color: 'var(--text-muted)' }}>
                        {product.description}
                      </p>
                    )}
                    <div className="flex items-end justify-between mt-auto">
                      <span className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>
                        S/ {product.price.toFixed(2)}
                      </span>
                      {cartItem ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center border transition-colors"
                            style={{ borderColor: 'var(--border-color)' }}
                            id={`decrease-${product.id}`}
                          >
                            <Minus size={13} />
                          </button>
                          <span className="font-bold w-5 text-center text-sm">{cartItem.quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors"
                            style={{ background: restaurant.brand_color }}
                            id={`increase-${product.id}`}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                          style={{ background: restaurant.brand_color }}
                          id={`add-${product.id}`}
                        >
                          <Plus size={14} /> Agregar
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

      {/* ===== CHECKOUT VIEW ===== */}
      {step === 'checkout' && (
        <div className="max-w-xl mx-auto px-6 py-8 pb-32 space-y-5 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep('category')} className="btn btn-ghost btn-sm">
              <ArrowLeft size={16} /> Volver
            </button>
            <h2 className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Datos de entrega</h2>
          </div>

          {/* Order summary */}
          <div className="card p-4">
            <h3 className="font-semibold mb-3 text-sm" style={{ color: 'var(--text-primary)' }}>
              Pedido ({cartCount} items)
            </h3>
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{item.quantity}x {item.product.name}</span>
                  <span className="font-medium">S/ {(item.product.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold text-sm" style={{ borderColor: 'var(--border-color)' }}>
                <span>Total</span>
                <span style={{ color: restaurant.brand_color }}>S/ {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Personal data */}
          <div className="card p-4 space-y-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Datos personales</h3>
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
          <div className="card p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Dirección de entrega</h3>
              <span className="text-xs text-slate-400 font-medium">Manual o GPS</span>
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
              className="btn btn-secondary w-full text-xs font-semibold py-2.5 flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-100 transition-colors"
              id="btn-gps"
            >
              {isLocating ? (
                <><Loader2 size={15} className="animate-spin" /> Obteniendo coordenadas y dirección...</>
              ) : (
                <>
                  <MapPin size={15} style={{ color: location ? '#10B981' : restaurant.brand_color }} />
                  {location ? 'Ubicación GPS sincronizada (Clic para recalcular)' : 'Autocompletar dirección con mi GPS actual (Opcional)'}
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
          <div className="card p-4 space-y-4">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Método de pago</h3>
            <div className="grid grid-cols-3 gap-2">
              {(['EFECTIVO', 'YAPE', 'PLIN'] as PaymentMethod[]).map(method => (
                <button key={method} onClick={() => setForm(f => ({ ...f, payment_method: method }))}
                  className="p-3 rounded-xl border-2 text-center transition-all text-sm font-medium"
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
          <div className="card p-4">
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
        <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', borderColor: 'var(--border-color)' }}>
          <div className="max-w-5xl mx-auto">
            {step === 'category' ? (
              <button
                onClick={() => {
                  if (cart.length === 0) { toast.error('Agregue al menos un producto'); return; }
                  setStep('checkout');
                }}
                className="btn btn-primary btn-lg btn-full"
                style={{ background: restaurant.brand_color }}
                disabled={cart.length === 0}
                id="btn-go-checkout"
              >
                <ShoppingBag size={18} />
                Continuar ({cartCount} items &mdash; S/ {cartTotal.toFixed(2)})
              </button>
            ) : (
              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting}
                className="btn btn-lg btn-full text-white font-bold"
                style={{ background: '#15803D' }}
                id="btn-confirm-order"
              >
                {isSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> Procesando...</>
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
                onClick={() => { setIsCartOpen(false); setStep('checkout'); }}
                className="btn btn-lg btn-full text-white font-bold"
                style={{ background: '#15803D' }}
                disabled={cart.length === 0}
                id="btn-cart-checkout"
              >
                Continuar al Pago
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
