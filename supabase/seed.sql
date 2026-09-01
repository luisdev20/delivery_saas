-- ============================================================
-- Seed Data: Delivery Platform (Multi-Tenant B2B SaaS)
-- ============================================================

-- 1. Restaurante / Asador Criollo
INSERT INTO restaurants (id, name, slug, phone, address, brand_color, is_open, lat, lng, max_delivery_radius_km)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Fuego & Carbón',
  'fuego-carbon',
  '987654321',
  'Av. La Marina 1234, San Miguel, Lima',
  '#DC2626',
  true,
  -12.0782,
  -77.0854,
  12.0
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  brand_color = EXCLUDED.brand_color;

INSERT INTO subscriptions (restaurant_id, plan, max_drivers, max_orders_per_month)
VALUES ('00000000-0000-0000-0000-000000000001', 'GROWTH', 5, 2000)
ON CONFLICT (restaurant_id) DO NOTHING;

INSERT INTO drivers (id, restaurant_id, name, phone, is_active) VALUES
  ('0266640d-9d64-4852-9e07-0a3b7e6d5bf6', '00000000-0000-0000-0000-000000000001', 'Carlos Rios', '941000001', true),
  ('f515885e-2c37-4812-b744-2a6bc5aade8b', '00000000-0000-0000-0000-000000000001', 'Miguel Torres', '941000002', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Comercio B2B: Librería & Papelería
INSERT INTO restaurants (id, name, slug, phone, address, brand_color, is_open, lat, lng, max_delivery_radius_km)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Librería Atenea',
  'libreria-atenea',
  '981112233',
  'Av. Larco 456, Miraflores, Lima',
  '#0F766E',
  true,
  -12.1215,
  -77.0298,
  15.0
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  brand_color = EXCLUDED.brand_color;

INSERT INTO subscriptions (restaurant_id, plan, max_drivers, max_orders_per_month)
VALUES ('00000000-0000-0000-0000-000000000002', 'STARTER', 2, 500)
ON CONFLICT (restaurant_id) DO NOTHING;

INSERT INTO drivers (id, restaurant_id, name, phone, is_active) VALUES
  ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000000002', 'Jorge Mendoza', '942000001', true),
  ('11111111-1111-1111-1111-111111111102', '00000000-0000-0000-0000-000000000002', 'Diego Salazar', '942000002', true)
ON CONFLICT (id) DO NOTHING;
