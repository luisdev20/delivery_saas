export type OrderStatus = 'RECIBIDO' | 'EN_PREPARACION' | 'LISTO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO';
export type PaymentMethod = 'EFECTIVO' | 'YAPE' | 'PLIN';
export type PlanType = 'STARTER' | 'GROWTH' | 'ENTERPRISE';
export type UserRole = 'superadmin' | 'owner' | 'manager';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  max_delivery_radius_km: number;
  logo_url: string | null;
  cover_image_url: string | null;
  brand_color: string;
  is_open: boolean;
  business_hours: Record<string, { open: string; close: string }> | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  restaurant_id: string;
  plan: PlanType;
  max_drivers: number;
  max_orders_per_month: number;
  orders_this_month: number;
  billing_cycle_start: string;
  is_active: boolean;
  created_at: string;
}

export interface RestaurantUser {
  id: string;
  user_id: string;
  restaurant_id: string;
  role: UserRole;
  created_at: string;
}

export interface Driver {
  id: string;
  user_id: string | null;
  restaurant_id: string;
  name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  image_url: string | null;
  is_available: boolean;
  available_days: number[];
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  driver_id: string | null;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_reference: string | null;
  delivery_lat: number;
  delivery_lng: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  cash_amount_change: number | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  delivered_at: string | null;
  driver?: Driver;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface DriverLocation {
  driver_id: string;
  restaurant_id: string;
  current_order_id: string | null;
  current_lat: number;
  current_lng: number;
  updated_at: string;
  driver?: Driver;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

/* Plan limits reference */
export const PLAN_LIMITS: Record<PlanType, { label: string; maxDrivers: number; maxOrders: number; price: number }> = {
  STARTER:    { label: 'Starter',    maxDrivers: 2,  maxOrders: 300,   price: 99 },
  GROWTH:     { label: 'Growth',     maxDrivers: 6,  maxOrders: 1200,  price: 199 },
  ENTERPRISE: { label: 'Enterprise', maxDrivers: 999, maxOrders: 999999, price: 399 },
};
