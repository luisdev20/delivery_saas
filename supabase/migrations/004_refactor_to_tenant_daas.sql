-- ============================================================
-- Migración 004: Arquitectura SaaS DaaS Logística Pura (Multi-tenant)
-- Script 100% idempotente y auto-reparable
-- ============================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Eliminar tablas obsoletas del menú de restaurante
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;

-- 3. Tabla TENANTS (Si existe restaurants se renombra, si no existe se crea)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurants') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        ALTER TABLE restaurants RENAME TO tenants;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                   VARCHAR(100) NOT NULL,
    slug                   VARCHAR(50) UNIQUE NOT NULL,
    phone                  VARCHAR(20) NOT NULL,
    address                TEXT NOT NULL,
    lat                    DOUBLE PRECISION,
    lng                    DOUBLE PRECISION,
    max_delivery_radius_km DECIMAL(5,2) DEFAULT 10.0,
    business_type          VARCHAR(50) DEFAULT 'LOGISTICA_GENERAL',
    logo_url               TEXT,
    cover_image_url        TEXT,
    brand_color            VARCHAR(7) DEFAULT '#4F46E5',
    is_open                BOOLEAN DEFAULT true,
    created_at             TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Tabla TENANT_USERS (Si existe restaurant_users se renombra, si no existe se crea)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_users') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_users') THEN
        ALTER TABLE restaurant_users RENAME TO tenant_users;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_users (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    role           TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('superadmin', 'owner', 'manager', 'dispatcher')),
    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id)
);

-- 5. Tabla TENANT_API_KEYS (Si existe merchant_api_keys se renombra, si no existe se crea)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchant_api_keys') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_api_keys') THEN
        ALTER TABLE merchant_api_keys RENAME TO tenant_api_keys;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    key_hash       TEXT NOT NULL,
    key_prefix     VARCHAR(16) NOT NULL,
    name           VARCHAR(100) NOT NULL DEFAULT 'API Key Principal',
    is_active      BOOLEAN DEFAULT true NOT NULL,
    last_used_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. Renombrar columnas foráneas restaurant_id -> tenant_id si existen
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_users' AND column_name = 'restaurant_id') THEN
        ALTER TABLE tenant_users RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'restaurant_id') THEN
        ALTER TABLE subscriptions RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'restaurant_id') THEN
        ALTER TABLE drivers RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'driver_locations' AND column_name = 'restaurant_id') THEN
        ALTER TABLE driver_locations RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'restaurant_id') THEN
        ALTER TABLE orders RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenant_api_keys' AND column_name = 'restaurant_id') THEN
        ALTER TABLE tenant_api_keys RENAME COLUMN restaurant_id TO tenant_id;
    END IF;
END $$;

-- 7. Limpieza y estandarización de columnas en orders
ALTER TABLE orders DROP COLUMN IF EXISTS cash_amount_change;
ALTER TABLE orders ALTER COLUMN payment_method DROP NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_code VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin_system VARCHAR(50) DEFAULT 'API_REST';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS in_route_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS package_notes TEXT;

-- 8. Funciones helper actualizadas para tenant
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND role = 'superadmin'
    );
$$;

-- 9. Habilitar Realtime en las tablas clave de logística
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tenants;
    EXCEPTION WHEN duplicate_object THEN END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tenant_users;
    EXCEPTION WHEN duplicate_object THEN END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE tenant_api_keys;
    EXCEPTION WHEN duplicate_object THEN END;
END $$;

-- 10. Políticas de Seguridad (RLS) actualizadas para Tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Políticas de tenants
DROP POLICY IF EXISTS "restaurants_select_public" ON tenants;
DROP POLICY IF EXISTS "restaurants_update_owner" ON tenants;
DROP POLICY IF EXISTS "tenants_select_public" ON tenants;
DROP POLICY IF EXISTS "tenants_update_owner" ON tenants;
CREATE POLICY "tenants_select_public" ON tenants FOR SELECT USING (true);
CREATE POLICY "tenants_update_owner" ON tenants FOR UPDATE USING (id = get_user_tenant_id() OR is_superadmin());

-- Políticas de tenant_users
DROP POLICY IF EXISTS "users_read_own" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_read_own" ON tenant_users;
CREATE POLICY "tenant_users_read_own" ON tenant_users FOR SELECT USING (user_id = auth.uid());

-- Políticas de tenant_api_keys
DROP POLICY IF EXISTS "api_keys_owner_select" ON tenant_api_keys;
DROP POLICY IF EXISTS "api_keys_owner_all" ON tenant_api_keys;
DROP POLICY IF EXISTS "tenant_api_keys_owner_select" ON tenant_api_keys;
DROP POLICY IF EXISTS "tenant_api_keys_owner_all" ON tenant_api_keys;
CREATE POLICY "tenant_api_keys_owner_select" ON tenant_api_keys FOR SELECT USING (tenant_id = get_user_tenant_id() OR is_superadmin());
CREATE POLICY "tenant_api_keys_owner_all" ON tenant_api_keys FOR ALL USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- Políticas de orders
DROP POLICY IF EXISTS "orders_select_public" ON orders;
DROP POLICY IF EXISTS "orders_insert_public" ON orders;
DROP POLICY IF EXISTS "orders_update_owner" ON orders;
CREATE POLICY "orders_select_public" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert_public" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update_owner" ON orders FOR UPDATE USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- Políticas de drivers
DROP POLICY IF EXISTS "drivers_select_owner" ON drivers;
CREATE POLICY "drivers_select_owner" ON drivers FOR SELECT USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- 11. Vistas de compatibilidad (retrocompatibilidad)
CREATE OR REPLACE VIEW restaurants AS SELECT * FROM tenants;
CREATE OR REPLACE VIEW restaurant_users AS SELECT * FROM tenant_users;
