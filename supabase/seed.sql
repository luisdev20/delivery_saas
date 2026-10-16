-- ============================================================
-- Seed de datos demo — Delivery Tracker (SaaS / DaaS multi-tenant)
-- ------------------------------------------------------------
-- Refleja el esquema ACTUAL:
--   * `tenants`            (ya no existe `restaurants`)
--   * `orders.tenant_id`   (no `restaurant_id`)
--   * `drivers`            (con `deleted_at` para bajas lógicas)
--   * `driver_credentials` (hash de contraseña, nunca texto plano)
--   * `subscriptions`      (con `tenant_id`)
--
-- Es idempotente: puede ejecutarse varias veces sin duplicar datos.
-- Se aplica a mano en el SQL Editor de Supabase (este repo no usa
-- config.toml ni el historial del CLI; ver supabase/migrations/).
-- ============================================================

-- Extensión necesaria para hashear contraseñas (pgcrypto vive en `extensions`)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Comercios (tenants) --------------------------------------
INSERT INTO tenants (id, name, slug, phone, address, brand_color, is_open,
                     lat, lng, max_delivery_radius_km, business_type, cover_image_url)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Fuego & Carbón',  'fuego-carbon',    '987654321', 'Av. La Marina 1234, San Miguel, Lima', '#DC2626', true, -12.0782, -77.0854, 12.0, 'RESTAURANTE', NULL),
  ('00000000-0000-0000-0000-000000000002', 'Librería Atenea', 'libreria-atenea', '981112233', 'Av. Larco 456, Miraflores, Lima',      '#0F766E', true, -12.1215, -77.0298, 15.0, 'RETAIL',      NULL)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      brand_color = EXCLUDED.brand_color,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      max_delivery_radius_km = EXCLUDED.max_delivery_radius_km,
      business_type = EXCLUDED.business_type;

-- 2. Suscripciones --------------------------------------------
INSERT INTO subscriptions (tenant_id, plan, max_drivers, max_orders_per_month)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'GROWTH', 5, 2000),
  ('00000000-0000-0000-0000-000000000002', 'GROWTH', 6,  500)
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Repartidores ---------------------------------------------
INSERT INTO drivers (id, tenant_id, name, phone, is_active) VALUES
  ('0266640d-9d64-4852-9e07-0a3b7e6d5bf6', '00000000-0000-0000-0000-000000000001', 'Carlos Rios',   '941000001', true),
  ('f515885e-2c37-4812-b744-2a6bc5aade8b', '00000000-0000-0000-0000-000000000001', 'Miguel Torres', '941000002', true),
  ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000000002', 'Jorge Mendoza', '942000001', true),
  ('11111111-1111-1111-1111-111111111102', '00000000-0000-0000-0000-000000000002', 'Diego Salazar', '942000002', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Credenciales de repartidor (contraseña demo: demo1234) ----
-- Solo para cuentas demo; en producción se definen desde el panel
-- (acción "Contraseña" / "Restablecer contraseña").
INSERT INTO driver_credentials (driver_id, password_hash)
SELECT d.id, extensions.crypt('demo1234', extensions.gen_salt('bf'))
  FROM drivers d
 WHERE d.phone IN ('941000001', '941000002', '942000001', '942000002')
ON CONFLICT (driver_id) DO NOTHING;
