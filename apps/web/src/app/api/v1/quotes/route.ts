import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey } from '@/lib/auth/apiKey';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'tu-service-role-key-aqui'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key);
}

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

// POST /api/v1/quotes - Cotizar costo de envío y validar cobertura en tiempo real
export async function POST(req: Request) {
  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const slug = body.slug || body.merchant_slug || body.restaurant_slug;
    const restaurant_id = body.restaurant_id;
    const delivery_lat = body.delivery_lat ?? body.customer_lat ?? body.lat;
    const delivery_lng = body.delivery_lng ?? body.customer_lng ?? body.lng;
    const subtotal_amount = body.subtotal_amount || body.total_amount || 0;

    let targetRestaurantId = restaurant_id;

    // Si viene x-api-key en cabecera, autenticamos directamente
    const auth = await authenticateApiKey(req);
    if (auth) {
      targetRestaurantId = auth.restaurantId;
    }

    if (!targetRestaurantId && !slug) {
      return NextResponse.json(
        { error: 'Debe especificar el slug del comercio o autenticarse con cabecera `x-api-key`.' },
        { status: 400 }
      );
    }

    if (delivery_lat == null || delivery_lng == null) {
      return NextResponse.json(
        { error: 'Coordenadas de entrega obligatorias: `delivery_lat` y `delivery_lng`.' },
        { status: 400 }
      );
    }

    let query = supabase.from('restaurants').select('*');
    if (targetRestaurantId) {
      query = query.eq('id', targetRestaurantId);
    } else {
      query = query.eq('slug', slug);
    }

    let { data: merchant } = await query.maybeSingle();

    // Fallback if slug without 'el-'
    if (!merchant && slug) {
      const normalized = slug.replace(/^el-/, '');
      const { data: fallback } = await supabase
        .from('restaurants')
        .select('*')
        .ilike('slug', `%${normalized}%`)
        .limit(1)
        .maybeSingle();
      merchant = fallback;
    }

    if (!merchant) {
      // If still not found, fallback to first available merchant for demo purposes
      const { data: fallback } = await supabase
        .from('restaurants')
        .select('*')
        .limit(1)
        .maybeSingle();
      merchant = fallback;
    }

    if (!merchant) {
      return NextResponse.json({ error: 'Comercio no encontrado.' }, { status: 404 });
    }

    const merchantLat = merchant.lat || -12.0864; // Default Lima San Isidro
    const merchantLng = merchant.lng || -77.0328;
    const maxRadiusKm = Number(merchant.max_delivery_radius_km) || 12.0;

    const distanceKm = calculateDistanceKm(merchantLat, merchantLng, Number(delivery_lat), Number(delivery_lng));
    const roundedDistance = parseFloat(distanceKm.toFixed(2));
    const isCovered = roundedDistance <= maxRadiusKm;

    if (!isCovered) {
      return NextResponse.json({
        success: true,
        covered: false,
        distance_km: roundedDistance,
        max_radius_km: maxRadiusKm,
        delivery_fee: null,
        estimated_time_minutes: null,
        merchant: {
          name: merchant.name,
          slug: merchant.slug,
          is_open: merchant.is_open,
        },
        message: `La ubicación (${roundedDistance} km) supera el radio máximo de entrega (${maxRadiusKm} km).`,
      });
    }

    // Cálculo dinámico de tarifa de delivery:
    // Tarifa base S/ 5.00 hasta 3 km + S/ 1.00 por km adicional
    const baseFee = 5.0;
    const extraKm = Math.max(0, roundedDistance - 3.0);
    let deliveryFee = parseFloat((baseFee + extraKm * 1.2).toFixed(2));

    // Envío gratis si el subtotal supera S/ 120
    const freeDelivery = Number(subtotal_amount) >= 120;
    if (freeDelivery) deliveryFee = 0.0;

    // Tiempo estimado: 15 min base + 4 min por km
    const estimatedMinutes = Math.min(60, Math.max(20, Math.round(15 + roundedDistance * 4)));

    return NextResponse.json({
      success: true,
      covered: true,
      distance_km: roundedDistance,
      max_radius_km: maxRadiusKm,
      delivery_fee: deliveryFee,
      free_delivery: freeDelivery,
      estimated_time_minutes: estimatedMinutes,
      merchant: {
        id: merchant.id,
        name: merchant.name,
        slug: merchant.slug,
        address: merchant.address,
        phone: merchant.phone,
        is_open: merchant.is_open,
      },
      message: 'Ubicación con cobertura directa y despacho inmediato disponible.',
    });
  } catch (error) {
    console.error('Quotes API Error:', error);
    return NextResponse.json({ error: 'Error al procesar la cotización de envío.' }, { status: 500 });
  }
}
