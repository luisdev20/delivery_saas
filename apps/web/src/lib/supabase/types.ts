export type OrderStatus =
  | 'RECIBIDO'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'EN_CAMINO'
  | 'ENTREGADO'
  | 'CANCELADO';

export type PlanType = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type UserRole = 'superadmin' | 'owner' | 'manager' | 'dispatcher';
export type BusinessType = 'RESTAURANTE' | 'FARMACIA' | 'RETAIL' | 'LOGISTICA_GENERAL' | 'OTRO';

export type CancellationReason =
  | 'QUIEBRE_STOCK'
  | 'DIRECCION_INVALIDA'
  | 'CLIENTE_CANCELO'
  | 'FUERA_DE_COBERTURA'
  | 'TIEMPO_EXCEDIDO'
  | 'OTRO';

export const CANCELLATION_REASONS: Record<CancellationReason, string> = {
  QUIEBRE_STOCK: 'Quiebre de stock / Paquete no disponible',
  DIRECCION_INVALIDA: 'Dirección de entrega inválida o inalcanzable',
  CLIENTE_CANCELO: 'El cliente solicitó cancelación del despacho',
  FUERA_DE_COBERTURA: 'Ubicación fuera del radio de entrega',
  TIEMPO_EXCEDIDO: 'Capacidad operativa excedida',
  OTRO: 'Otro motivo logístico',
};

/** Quién ejecutó la cancelación. */
export type CancellationBy = 'CLIENTE' | 'REPARTIDOR' | 'TIENDA' | 'SISTEMA';

export type DriverCancellationReason =
  | 'DRIVER_CLIENT_REFUSED'
  | 'DRIVER_NO_SHOW'
  | 'DRIVER_CANT_REACH'
  | 'DRIVER_OTHER';

export const DRIVER_CANCELLATION_REASONS: Record<DriverCancellationReason, string> = {
  DRIVER_CLIENT_REFUSED: 'El cliente se rehusó a recibir el pedido',
  DRIVER_NO_SHOW: 'No salieron a recibir el pedido',
  DRIVER_CANT_REACH: 'No me es posible llegar al destino',
  DRIVER_OTHER: 'Otros (especificar)',
};

export type CustomerCancellationReason =
  | 'CUSTOMER_NO_LONGER_WANTS'
  | 'CUSTOMER_BAD_CONDITION'
  | 'CUSTOMER_OTHER';

export const CUSTOMER_CANCELLATION_REASONS: Record<CustomerCancellationReason, string> = {
  CUSTOMER_NO_LONGER_WANTS: 'Ya no deseo el pedido (se le cobrará el cargo del envío)',
  CUSTOMER_BAD_CONDITION: 'El pedido llegó en mal estado',
  CUSTOMER_OTHER: 'Otro (especificar)',
};

/** Códigos cuyo detalle es obligatorio (opción "especificar"). */
export const REQUIRES_DETAIL: readonly string[] = ['DRIVER_OTHER', 'CUSTOMER_OTHER'];

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  max_delivery_radius_km: number;
  business_type?: BusinessType;
  logo_url: string | null;
  cover_image_url: string | null;
  brand_color: string;
  is_open?: boolean;
  created_at: string;
}

// Aliases para compatibilidad
export type Restaurant = Tenant;

export interface Subscription {
  id: string;
  tenant_id: string;
  restaurant_id?: string;
  plan: PlanType;
  max_drivers: number;
  max_orders_per_month: number;
  orders_this_month: number;
  billing_cycle_start: string;
  is_active: boolean;
  created_at: string;
}

export interface TenantUser {
  id: string;
  user_id: string;
  tenant_id: string;
  restaurant_id?: string;
  role: UserRole;
  created_at: string;
}

export type RestaurantUser = TenantUser;

export interface Driver {
  id: string;
  user_id: string | null;
  tenant_id: string;
  restaurant_id?: string;
  name: string;
  phone: string;
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
}

export type PaymentMethod = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'PAGADO_ORIGEN' | string;

export interface OrderItem {
  id: string;
  order_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  tenant_id: string;
  restaurant_id?: string;
  driver_id: string | null;
  order_number: number;
  pin_code: string;
  external_order_id: string | null;
  origin_system: string | null;
  cancellation_reason: string | null;
  cancelled_by: CancellationBy | null;
  cancelled_at: string | null;
  claim_reason: string | null;
  claimed_at: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string | null;
  delivery_lat: number;
  delivery_lng: number;
  status: OrderStatus;
  total_amount: number;
  notes: string | null;
  package_notes: string | null;
  created_at: string;
  assigned_at: string | null;
  in_route_at: string | null;
  delivered_at: string | null;
  driver?: Driver;
  payment_method?: PaymentMethod;
  order_items?: OrderItem[];
}

export interface DriverLocation {
  driver_id: string;
  tenant_id: string;
  restaurant_id?: string;
  current_order_id: string | null;
  current_lat: number;
  current_lng: number;
  updated_at: string;
  driver?: Driver;
}

export interface TenantApiKey {
  id: string;
  tenant_id: string;
  restaurant_id?: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export type MerchantApiKey = TenantApiKey;

/* Plan limits reference */
export const PLAN_LIMITS: Record<PlanType, { label: string; maxDrivers: number; maxOrders: number; price: number }> = {
  STARTER:    { label: 'Starter',    maxDrivers: 2,  maxOrders: 300,    price: 99 },
  GROWTH:     { label: 'Growth',     maxDrivers: 6,  maxOrders: 1200,   price: 199 },
  ENTERPRISE: { label: 'Enterprise', maxDrivers: 999, maxOrders: 999999, price: 399 },
};
