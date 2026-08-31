-- ============================================================
-- Migración 002: Multi-tenant, campos de ubicación y RLS estricto
-- ============================================================

-- 1. Nuevos campos en restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_delivery_radius_km DECIMAL(5,2) DEFAULT 10.0;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "1": {"open": "11:00", "close": "22:00"},
  "2": {"open": "11:00", "close": "22:00"},
  "3": {"open": "11:00", "close": "22:00"},
  "4": {"open": "11:00", "close": "22:00"},
  "5": {"open": "11:00", "close": "22:00"},
  "6": {"open": "11:00", "close": "22:00"},
  "7": {"open": "11:00", "close": "22:00"}
}'::jsonb;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- 2. Tabla de vinculación usuario-restaurante
CREATE TABLE IF NOT EXISTS restaurant_users (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    restaurant_id  UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    role           TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('superadmin', 'owner', 'manager')),
    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id)
);

-- Habilitar RLS en restaurant_users
ALTER TABLE restaurant_users ENABLE ROW LEVEL SECURITY;

-- Política: cada usuario solo puede ver su propio registro
CREATE POLICY "users_read_own" ON restaurant_users
    FOR SELECT USING (user_id = auth.uid());

-- Política: superadmin puede insertar nuevos registros
CREATE POLICY "superadmin_insert" ON restaurant_users
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM restaurant_users
            WHERE user_id = auth.uid() AND role = 'superadmin'
        )
    );

-- Publicar en realtime
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_users;

-- 3. Función helper para obtener el restaurant_id del usuario autenticado
CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT restaurant_id FROM restaurant_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Función helper para verificar si el usuario es superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM restaurant_users WHERE user_id = auth.uid() AND role = 'superadmin'
    );
$$;

-- 4. Reemplazar políticas RLS permisivas por políticas estrictas

-- === RESTAURANTS ===
DROP POLICY IF EXISTS "pub_read_restaurants" ON restaurants;
DROP POLICY IF EXISTS "admin_all_restaurants" ON restaurants;

CREATE POLICY "restaurants_select_public" ON restaurants
    FOR SELECT USING (true);

CREATE POLICY "restaurants_update_owner" ON restaurants
    FOR UPDATE USING (id = get_user_restaurant_id() OR is_superadmin());

CREATE POLICY "restaurants_insert_superadmin" ON restaurants
    FOR INSERT WITH CHECK (is_superadmin());

CREATE POLICY "restaurants_delete_superadmin" ON restaurants
    FOR DELETE USING (is_superadmin());

-- === PRODUCTS ===
DROP POLICY IF EXISTS "pub_read_products" ON products;
DROP POLICY IF EXISTS "admin_all_products" ON products;

CREATE POLICY "products_select_public" ON products
    FOR SELECT USING (true);

CREATE POLICY "products_insert_owner" ON products
    FOR INSERT WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "products_update_owner" ON products
    FOR UPDATE USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "products_delete_owner" ON products
    FOR DELETE USING (restaurant_id = get_user_restaurant_id());

-- === ORDERS ===
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
DROP POLICY IF EXISTS "pub_read_orders_by_id" ON orders;
DROP POLICY IF EXISTS "pub_insert_orders" ON orders;

CREATE POLICY "orders_select_public" ON orders
    FOR SELECT USING (true);

CREATE POLICY "orders_insert_public" ON orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "orders_update_owner" ON orders
    FOR UPDATE USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "orders_delete_owner" ON orders
    FOR DELETE USING (restaurant_id = get_user_restaurant_id());

-- === ORDER_ITEMS ===
DROP POLICY IF EXISTS "admin_all_order_items" ON order_items;
DROP POLICY IF EXISTS "pub_read_order_items" ON order_items;
DROP POLICY IF EXISTS "pub_insert_order_items" ON order_items;

CREATE POLICY "order_items_select_public" ON order_items
    FOR SELECT USING (true);

CREATE POLICY "order_items_insert_public" ON order_items
    FOR INSERT WITH CHECK (true);

CREATE POLICY "order_items_update_owner" ON order_items
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.restaurant_id = get_user_restaurant_id())
    );

CREATE POLICY "order_items_delete_owner" ON order_items
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.restaurant_id = get_user_restaurant_id())
    );

-- === DRIVERS ===
DROP POLICY IF EXISTS "admin_all_drivers" ON drivers;

CREATE POLICY "drivers_select_owner" ON drivers
    FOR SELECT USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "drivers_insert_owner" ON drivers
    FOR INSERT WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "drivers_update_owner" ON drivers
    FOR UPDATE USING (restaurant_id = get_user_restaurant_id());

CREATE POLICY "drivers_delete_owner" ON drivers
    FOR DELETE USING (restaurant_id = get_user_restaurant_id());

-- === DRIVER_LOCATIONS ===
DROP POLICY IF EXISTS "admin_all_driver_locations" ON driver_locations;
DROP POLICY IF EXISTS "pub_read_driver_locs" ON driver_locations;

CREATE POLICY "driver_locations_select_public" ON driver_locations
    FOR SELECT USING (true);

CREATE POLICY "driver_locations_insert_owner" ON driver_locations
    FOR INSERT WITH CHECK (restaurant_id = get_user_restaurant_id());

CREATE POLICY "driver_locations_update_owner" ON driver_locations
    FOR UPDATE USING (restaurant_id = get_user_restaurant_id());

-- === SUBSCRIPTIONS ===
DROP POLICY IF EXISTS "admin_all_subscriptions" ON subscriptions;

CREATE POLICY "subscriptions_select_owner" ON subscriptions
    FOR SELECT USING (restaurant_id = get_user_restaurant_id() OR is_superadmin());

CREATE POLICY "subscriptions_insert_superadmin" ON subscriptions
    FOR INSERT WITH CHECK (is_superadmin());

CREATE POLICY "subscriptions_update_superadmin" ON subscriptions
    FOR UPDATE USING (is_superadmin());
