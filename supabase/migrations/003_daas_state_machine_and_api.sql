-- ============================================================
-- Migración 003: Motor Logístico DaaS B2B Agnóstico
-- - Nueva máquina de estados: RECIBIDO, EN_PREPARACION, LISTO_PARA_ENTREGA, ASIGNADO, EN_CAMINO, ENTREGADO, CANCELADO
-- - Código PIN de 4 dígitos para validación anti-fraude
-- - Soporte para API Keys B2B (merchant_api_keys)
-- - Campos para tracking externo y motivos estructurados de cancelación
-- ============================================================

-- 1. Actualización de valores de tipo order_status
-- PostgreSQL permite agregar valores a un ENUM existente
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'LISTO_PARA_ENTREGA';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ASIGNADO';

-- Actualizar registros existentes que tengan 'LISTO' a 'LISTO_PARA_ENTREGA' si aplica
UPDATE orders SET status = 'LISTO_PARA_ENTREGA' WHERE status = 'LISTO';

-- 2. Nuevos campos en la tabla orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pin_code VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_id VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin_system VARCHAR(50) DEFAULT 'API_REST';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS in_route_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS package_notes TEXT;

-- Asegurar que todas las órdenes tengan un PIN de 4 dígitos
UPDATE orders SET pin_code = LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0') WHERE pin_code IS NULL;

-- 3. Campo de tipo de comercio en restaurants (merchants)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'RESTAURANTE';

-- 4. Tabla de API Keys B2B para Comercios (Plug & Play)
CREATE TABLE IF NOT EXISTS merchant_api_keys (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id  UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    key_hash       TEXT NOT NULL,
    key_prefix     VARCHAR(16) NOT NULL,
    name           VARCHAR(100) NOT NULL DEFAULT 'Clave API Principal',
    is_active      BOOLEAN DEFAULT true NOT NULL,
    last_used_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE merchant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_owner_select" ON merchant_api_keys
    FOR SELECT USING (restaurant_id = get_user_restaurant_id() OR is_superadmin());

CREATE POLICY "api_keys_owner_all" ON merchant_api_keys
    FOR ALL USING (restaurant_id = get_user_restaurant_id() OR is_superadmin());

ALTER PUBLICATION supabase_realtime ADD TABLE merchant_api_keys;

-- 5. Función helper para generar PIN aleatorio de 4 dígitos
CREATE OR REPLACE FUNCTION generate_order_pin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pin_code IS NULL OR NEW.pin_code = '' THEN
        NEW.pin_code := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_order_pin ON orders;
CREATE TRIGGER trigger_set_order_pin
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_pin();
