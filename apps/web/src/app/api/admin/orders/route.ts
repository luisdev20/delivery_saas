import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order, OrderStatus } from '@/lib/supabase/types';
import { requireTenantAccess } from '@/lib/auth/tenantAccess';
import { loadSubscriptionState } from '@/lib/server/subscription';
import {
  expiredSubscriptionMessage,
  quotaReachedMessage,
} from '@/lib/subscription';

interface ManualOrderBody {
  tenantId?: string;
  action?: 'assign_driver' | 'advance_status';
  orderId?: string;
  driverId?: string | null;
  status?: OrderStatus;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  itemDescription?: string;
  totalAmount?: number | string;
  notes?: string;
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  RECIBIDO: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
  LISTO: 'EN_CAMINO',
};

function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

async function incrementOrderCounter(admin: SupabaseClient, subscriptionId: string) {
  const { data: current } = await admin
    .from('subscriptions')
    .select('orders_this_month')
    .eq('id', subscriptionId)
    .maybeSingle();

  const nextValue = Number(current?.orders_this_month ?? 0) + 1;
  await admin
    .from('subscriptions')
    .update({ orders_this_month: nextValue })
    .eq('id', subscriptionId);
}

export async function POST(req: Request) {
  let body: ManualOrderBody;
  try {
    body = (await req.json()) as ManualOrderBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const access = await requireTenantAccess(body.tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { admin, tenantId } = access;
  const state = await loadSubscriptionState(admin, tenantId);

  if (state.snapshot.readOnly) {
    return NextResponse.json(
      {
        error: expiredSubscriptionMessage(state.snapshot.planLabel),
        code: 'SUBSCRIPTION_EXPIRED',
      },
      { status: 403 }
    );
  }

  if (state.snapshot.quotaReached) {
    return NextResponse.json(
      {
        error: quotaReachedMessage(state.snapshot.planLabel, state.snapshot.maxOrders),
        code: 'ORDER_QUOTA_REACHED',
      },
      { status: 429 }
    );
  }

  const customerName = (body.customerName || '').trim();
  const customerPhone = (body.customerPhone || '').trim();
  const deliveryAddress = (body.deliveryAddress || '').trim();

  if (!customerName || !customerPhone || !deliveryAddress) {
    return NextResponse.json(
      { error: 'Nombre, teléfono y dirección son obligatorios.' },
      { status: 400 }
    );
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('lat, lng, is_open')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenant && tenant.is_open === false) {
    return NextResponse.json(
      {
        error:
          'El comercio está pausado. Reanuda la recepción de pedidos desde Configuración del Negocio.',
        code: 'STORE_PAUSED',
      },
      { status: 409 }
    );
  }

  const pinCode = generatePinCode();
  const totalAmount = Number(body.totalAmount) || 0;
  const itemDescription = (body.itemDescription || '').trim() || 'Paquete para despacho';

  const { data: order, error } = await admin
    .from('orders')
    .insert({
      tenant_id: tenantId,
      origin_system: 'MANUAL_DISPATCH',
      pin_code: pinCode,
      customer_name: customerName,
      customer_phone: customerPhone,
      delivery_address: deliveryAddress,
      delivery_reference: (body.deliveryReference || '').trim() || null,
      delivery_lat: tenant?.lat ?? -12.0464,
      delivery_lng: tenant?.lng ?? -77.0428,
      status: 'RECIBIDO',
      total_amount: totalAmount,
      package_notes: itemDescription,
      notes: (body.notes || '').trim() || null,
    })
    .select()
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: `No se pudo registrar el despacho: ${error?.message || 'error desconocido'}` },
      { status: 500 }
    );
  }

  if (state.subscription) {
    await incrementOrderCounter(admin, state.subscription.id);
  }

  return NextResponse.json({ success: true, order: order as Order }, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: ManualOrderBody;
  try {
    body = (await req.json()) as ManualOrderBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const access = await requireTenantAccess(body.tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { admin, tenantId } = access;
  if (!body.orderId) {
    return NextResponse.json({ error: 'Falta el pedido.' }, { status: 400 });
  }

  const { data: order } = await admin
    .from('orders')
    .select('*')
    .eq('id', body.orderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  }

  if (body.action === 'assign_driver') {
    if (order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
      return NextResponse.json(
        { error: 'No se puede asignar un repartidor a un pedido finalizado o cancelado.' },
        { status: 409 }
      );
    }

    const state = await loadSubscriptionState(admin, tenantId);
    if (state.snapshot.readOnly) {
      return NextResponse.json(
        {
          error: expiredSubscriptionMessage(state.snapshot.planLabel),
          code: 'SUBSCRIPTION_EXPIRED',
        },
        { status: 403 }
      );
    }

    if (!body.driverId) {
      return NextResponse.json({ error: 'Selecciona un repartidor.' }, { status: 400 });
    }

    const { data: driver } = await admin
      .from('drivers')
      .select('id, is_active, deleted_at')
      .eq('id', body.driverId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!driver || driver.deleted_at || driver.is_active !== true) {
      return NextResponse.json(
        { error: 'El repartidor no está activo o no pertenece a tu comercio.' },
        { status: 400 }
      );
    }

    const currentStatus = order.status as OrderStatus;
    const nextStatus: OrderStatus =
      currentStatus === 'RECIBIDO' || currentStatus === 'EN_PREPARACION'
        ? 'LISTO'
        : currentStatus;

    const { data: updated, error } = await admin
      .from('orders')
      .update({
        driver_id: body.driverId,
        status: nextStatus,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: 'No se pudo asignar el repartidor al pedido.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, order: updated as Order });
  }

  if (body.action === 'advance_status') {
    const currentStatus = order.status as OrderStatus;
    const expected = NEXT_STATUS[currentStatus];

    if (!expected) {
      return NextResponse.json(
        { error: 'El pedido no puede avanzar desde su estado actual.' },
        { status: 409 }
      );
    }

    const updates: Record<string, unknown> = { status: expected };
    if (expected === 'EN_CAMINO') {
      if (!order.driver_id) {
        return NextResponse.json(
          { error: 'Asigna un repartidor antes de despachar.' },
          { status: 409 }
        );
      }
      updates.in_route_at = new Date().toISOString();
    }

    const { data: updated, error } = await admin
      .from('orders')
      .update(updates)
      .eq('id', order.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: 'No se pudo actualizar el estado del pedido.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, order: updated as Order });
  }

  return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 });
}
