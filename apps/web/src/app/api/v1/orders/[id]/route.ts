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
  const { id } = await params;
  const supabase = getSupabaseClient();

  let query = supabase
    .from('orders')
    .select('*, driver:drivers(id, name, phone)')
    .eq('id', id);

  if (auth) {
    query = query.eq('tenant_id', auth.restaurantId);
  }

  const { data: order, error } = await query.maybeSingle();

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

  let body: { reason?: string; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const { reason = 'OTRO', notes } = body;

  // Verificar que la orden pertenece al comercio autenticado (evita IDOR)
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.restaurantId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });
  }

  const reasonCode = (CANCELLATION_REASONS[reason as CancellationReason] ? reason : 'OTRO') as CancellationReason;

  // Una sola vía de ejecución: la misma RPC que usan la app del repartidor y el tracking.
  const { data: result, error: rpcError } = await supabase.rpc('cancel_order', {
    p_order_id: id,
    p_source: 'TIENDA',
    p_reason_code: reasonCode,
    p_notes: notes ?? null,
    p_driver_id: null,
  });

  if (rpcError) {
    return NextResponse.json({ error: 'Error al cancelar la orden.' }, { status: 500 });
  }

  const outcome = result as { success: boolean; outcome?: string; reason?: string; error?: string } | null;
  if (!outcome?.success) {
    return NextResponse.json({ error: outcome?.error || 'No se pudo cancelar la orden.' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    order_id: id,
    status: 'CANCELADO',
    outcome: outcome.outcome,
    cancellation_reason: outcome.reason,
    message: outcome.outcome === 'RECLAMO' ? 'Reclamo registrado.' : 'Orden cancelada exitosamente.',
  });
}
