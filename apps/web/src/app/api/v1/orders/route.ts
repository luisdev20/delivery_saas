import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey, generatePinCode } from '@/lib/auth/apiKey';
import type { PaymentMethod } from '@/lib/supabase/types';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'tu-service-role-key-aqui'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key);
}

// Haversine distance calculator
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/v1/orders - Crear requerimiento de despacho logístico
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'No autorizado. Proporcione una clave de API válida en la cabecera `x-api-key`.' },
      { status: 401 }
    );
  }

  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const {
      external_order_id,
      customer,
      items,
      payment,
      notes,
      origin_system = 'API_REST',
    } = body;

    // Validación básica de destinatario
    if (!customer?.name || !customer?.phone || !customer?.address) {
      return NextResponse.json(
        { error: 'Campos requeridos de cliente incompletos: `customer.name`, `customer.phone`, `customer.address`.' },
        { status: 400 }
      );
    }

    if (customer.lat == null || customer.lng == null) {
      return NextResponse.json(
        { error: 'Coordenadas de entrega obligatorias para telemetría: `customer.lat` y `customer.lng`.' },
        { status: 400 }
      );
    }

    // Obtener datos del comercio
    const { data: merchant, error: merchantError } = await supabase
      .from('restaurants')
      .select('id, name, lat, lng, max_delivery_radius_km, is_open')
      .eq('id', auth.restaurantId)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json({ error: 'Comercio no encontrado o inactivo.' }, { status: 404 });
    }

    // Validar radio máximo de delivery
    if (merchant.lat != null && merchant.lng != null && merchant.max_delivery_radius_km) {
      const distanceKm = calculateDistanceKm(merchant.lat, merchant.lng, customer.lat, customer.lng);
      if (distanceKm > merchant.max_delivery_radius_km) {
        return NextResponse.json(
          {
            error: 'Destino fuera de cobertura',
            message: `La distancia (${distanceKm.toFixed(2)} km) excede el radio máximo configurado (${merchant.max_delivery_radius_km} km).`,
            distance_km: parseFloat(distanceKm.toFixed(2)),
            max_radius_km: merchant.max_delivery_radius_km,
          },
          { status: 422 }
        );
      }
    }

    // Validar cuota mensual de suscripción
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, max_orders_per_month, orders_this_month, is_active')
      .eq('restaurant_id', auth.restaurantId)
      .eq('is_active', true)
      .maybeSingle();

    if (subscription && subscription.orders_this_month >= subscription.max_orders_per_month) {
      return NextResponse.json(
        {
          error: 'Límite de envíos mensuales alcanzado',
          message: 'Ha alcanzado el límite de pedidos permitidos para su plan actual. Actualice su suscripción para continuar despachando.',
        },
        { status: 429 }
      );
    }

    // Calcular total y estructurar ítems
    const parsedItems = Array.isArray(items) && items.length > 0
      ? items.map(item => ({
          product_name: item.name || item.description || 'Ítem de despacho',
          quantity: Math.max(1, Number(item.quantity) || 1),
          unit_price: Math.max(0, Number(item.unit_price) || 0),
        }))
      : [{ product_name: 'Paquete estándar', quantity: 1, unit_price: Number(payment?.total_amount) || 0 }];

    const calculatedTotal = parsedItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);
    const totalAmount = payment?.total_amount != null ? Number(payment.total_amount) : calculatedTotal;
    const paymentMethod: PaymentMethod = ['EFECTIVO', 'YAPE', 'PLIN', 'PAGADO_ORIGEN'].includes(payment?.method)
      ? payment.method
      : 'PAGADO_ORIGEN';

    const pinCode = generatePinCode();

    // Insertar orden en estado RECIBIDO
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: auth.restaurantId,
        external_order_id: external_order_id ? String(external_order_id) : null,
        origin_system: String(origin_system),
        pin_code: pinCode,
        customer_name: customer.name,
        customer_phone: customer.phone,
        delivery_address: customer.address,
        delivery_reference: customer.reference || null,
        delivery_lat: customer.lat,
        delivery_lng: customer.lng,
        status: 'RECIBIDO',
        payment_method: paymentMethod,
        cash_amount_change: paymentMethod === 'EFECTIVO' && payment?.cash_amount_change ? Number(payment.cash_amount_change) : null,
        total_amount: totalAmount,
        notes: notes || null,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Error creating order:', orderError);
      return NextResponse.json({ error: 'Error al registrar la orden en el motor logístico.' }, { status: 500 });
    }

    // Insertar ítems
    const orderItemsPayload = parsedItems.map(item => ({
      order_id: order.id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    await supabase.from('order_items').insert(orderItemsPayload);

    // Incrementar contador de órdenes del mes
    if (subscription) {
      await supabase
        .from('subscriptions')
        .update({ orders_this_month: subscription.orders_this_month + 1 })
        .eq('id', subscription.id);
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const trackingUrl = `${origin}/tracking/${order.id}`;

    return NextResponse.json(
      {
        success: true,
        order_id: order.id,
        order_number: order.order_number,
        external_order_id: order.external_order_id,
        status: 'RECIBIDO',
        pin_code: pinCode,
        total_amount: order.total_amount,
        tracking_url: trackingUrl,
        created_at: order.created_at,
        message: 'Requerimiento de despacho recibido y encolado en el centro de preparación.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('API Orders POST error:', error);
    return NextResponse.json({ error: 'Payload JSON inválido o error interno del servidor.' }, { status: 400 });
  }
}

// GET /api/v1/orders - Listar órdenes del comercio
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const supabase = getSupabaseClient();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20));

  let query = supabase
    .from('orders')
    .select('*, driver:drivers(id, name, phone), order_items(*)')
    .eq('restaurant_id', auth.restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Error al consultar órdenes.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: orders?.length || 0, data: orders });
}
