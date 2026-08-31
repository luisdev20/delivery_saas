import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey } from '@/lib/auth/apiKey';
import { CANCELLATION_REASONS, type CancellationReason } from '@/lib/supabase/types';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'tu-service-role-key-aqui'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key);
}

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/v1/orders/[id] - Consultar estado y telemetría de una orden
export async function GET(req: Request, { params }: Params) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, driver:drivers(id, name, phone), order_items(*)')
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });
  }

  // Si tiene repartidor asignado y está en camino, obtener su ubicación GPS en tiempo real
  let driverLocation = null;
  if (order.driver_id && order.status === 'EN_CAMINO') {
    const { data: loc } = await supabase
      .from('driver_locations')
      .select('current_lat, current_lng, updated_at')
      .eq('driver_id', order.driver_id)
      .maybeSingle();
    driverLocation = loc;
  }

  return NextResponse.json({
    success: true,
    data: {
      ...order,
      driver_telemetry: driverLocation,
    },
  });
}

// POST /api/v1/orders/[id] - Cancelación estructurada desde el sistema externo
export async function POST(req: Request, { params }: Params) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseClient();

  try {
    const body = await req.json();
    const { reason = 'OTRO', notes } = body;

    // Verificar si la orden existe y pertenece al comercio
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', id)
      .eq('restaurant_id', auth.restaurantId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });
    }

    if (order.status === 'ENTREGADO') {
      return NextResponse.json({ error: 'No se puede cancelar una orden ya entregada.' }, { status: 400 });
    }

    if (order.status === 'CANCELADO') {
      return NextResponse.json({ error: 'La orden ya se encuentra cancelada.' }, { status: 400 });
    }

    const structuredReason = (CANCELLATION_REASONS[reason as CancellationReason] ? reason : 'OTRO') as CancellationReason;
    const cancellationText = `${CANCELLATION_REASONS[structuredReason]}${notes ? `: ${notes}` : ''}`;

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'CANCELADO',
        cancellation_reason: cancellationText,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Error al cancelar la orden.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order_id: updated.id,
      status: 'CANCELADO',
      cancellation_reason: cancellationText,
      message: 'Orden cancelada exitosamente.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }
}
