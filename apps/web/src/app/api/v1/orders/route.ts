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
  let auth = await authenticateApiKey(req);
  const supabase = getSupabaseClient();

  try {
    const body = await req.json();

    // Fallback: Si no hay x-api-key en headers pero se envió merchant_slug en body
    if (!auth && body.merchant_slug) {
      const { data: store } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', body.merchant_slug)
        .maybeSingle();

      if (store) {
        auth = { restaurantId: store.id, keyId: 'slug-auth' };
      }
    }

    if (!auth) {
      return NextResponse.json(
        { error: 'No autorizado. Proporcione una clave de API válida en la cabecera `x-api-key`.' },
        { status: 401 }
      );
    }

    const {
      external_order_id,
      customer,
      items,
      payment,
      notes,
      origin_system = 'API_REST',
    } = body;

    // Normalizar datos de destinatario (admite formato anidado y formato plano)
    const customerData = customer || {
      name: body.customer_name,
      phone: body.customer_phone,
      address: body.delivery_address || body.address,
      reference: body.delivery_reference || body.reference,
      lat: body.customer_lat != null ? body.customer_lat : body.lat,
      lng: body.customer_lng != null ? body.customer_lng : body.lng,
    };

    // Validación básica de destinatario
    if (!customerData?.name || !customerData?.phone || !customerData?.address) {
      return NextResponse.json(
        { error: 'Campos requeridos de cliente incompletos: `customer.name`, `customer.phone`, `customer.address`.' },
        { status: 400 }
      );
    }

    if (customerData.lat == null || customerData.lng == null) {
      return NextResponse.json(
        { error: 'Coordenadas de entrega obligatorias para telemetría: `customer.lat` y `customer.lng`.' },
        { status: 400 }
      );
    }

    // Obtener datos del comercio
    const { data: merchant, error: merchantError } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', auth.restaurantId)
      .maybeSingle();

    if (merchantError || !merchant) {
      return NextResponse.json({ error: 'Comercio no encontrado o inactivo.' }, { status: 404 });
    }

    const maxRadius = Number(merchant.max_delivery_radius_km) || 12.0;

    // Validar radio máximo de delivery
    if (merchant.lat != null && merchant.lng != null) {
      const distanceKm = calculateDistanceKm(merchant.lat, merchant.lng, customerData.lat, customerData.lng);
      if (distanceKm > maxRadius) {
        return NextResponse.json(
          {
            error: 'Destino fuera de cobertura',
            message: `La distancia (${distanceKm.toFixed(2)} km) excede el radio máximo configurado (${maxRadius} km).`,
            distance_km: parseFloat(distanceKm.toFixed(2)),
            max_radius_km: maxRadius,
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
    // Map to supported database enum (EFECTIVO | YAPE | PLIN)
    const paymentMethod: PaymentMethod = ['EFECTIVO', 'YAPE', 'PLIN'].includes(payment?.method)
      ? payment.method
      : 'YAPE'; // Default safe enum for online card/gateway payments

    const pinCode = generatePinCode();
    const formattedNotes = `[${origin_system}] [PIN: ${pinCode}] ${notes ? `${notes}` : ''}`.trim();

    // Intentar insertar con schema completo
    let insertedOrder: { id: string; order_number: number; pin_code?: string } | null = null;

    const fullPayload = {
      restaurant_id: auth.restaurantId,
      external_order_id: external_order_id ? String(external_order_id) : null,
      origin_system: String(origin_system),
      pin_code: pinCode,
      customer_name: customerData.name,
      customer_phone: customerData.phone,
      delivery_address: customerData.address,
      delivery_reference: customerData.reference || null,
      delivery_lat: customerData.lat,
      delivery_lng: customerData.lng,
      status: 'RECIBIDO',
      payment_method: paymentMethod,
      cash_amount_change: paymentMethod === 'EFECTIVO' && payment?.cash_amount_change ? Number(payment.cash_amount_change) : null,
      total_amount: totalAmount,
      notes: formattedNotes,
    };

    const { data: order1, error: error1 } = await supabase
      .from('orders')
      .insert(fullPayload)
      .select()
      .single();

    if (!error1 && order1) {
      insertedOrder = order1;
    } else {
      // Fallback a columnas base compatibles
      const basePayload = {
        restaurant_id: auth.restaurantId,
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
        notes: formattedNotes,
      };

      const { data: order2, error: error2 } = await supabase
        .from('orders')
        .insert(basePayload)
        .select()
        .single();

      if (error2 || !order2) {
        console.error('Error creating order in Supabase:', error2);
        return NextResponse.json({ error: 'Error al registrar la orden en el motor logístico.' }, { status: 500 });
      }
      insertedOrder = { ...order2, pin_code: pinCode };
    }

    // Insertar ítems
    const orderItemsPayload = parsedItems.map(item => ({
      order_id: insertedOrder!.id,
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
    const trackingUrl = `${origin}/tracking/${insertedOrder!.id}`;

    return NextResponse.json(
      {
        success: true,
        order_id: insertedOrder!.id,
        order_number: insertedOrder!.order_number,
        external_order_id: external_order_id || null,
        status: 'RECIBIDO',
        pin_code: insertedOrder!.pin_code || pinCode,
        total_amount: totalAmount,
        tracking_url: trackingUrl,
        created_at: new Date().toISOString(),
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
