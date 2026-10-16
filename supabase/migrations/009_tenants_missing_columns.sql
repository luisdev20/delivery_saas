-- ============================================================
-- 009 — Completar columnas de `tenants` que el código ya usa
-- ------------------------------------------------------------
-- La tabla `tenants` (que nació como `restaurants`) quedó sin
-- estas columnas en el entorno desplegado, mientras que el
-- onboarding y el tipo `Tenant`
-- (apps/web/src/lib/supabase/types.ts) las escriben/leen.
--
-- Sin ellas:
--   * `POST /onboarding` falla (INSERT con columnas inexistentes).
--   * Las APIs que filtran por radio (quotes / orders) no operan.
--
-- Alinea la BD con el esquema previsto en 002_multitenant y
-- 004_refactor_to_tenant_daas. Es idempotente.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lat                    DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lng                    DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_delivery_radius_km DECIMAL(5,2) DEFAULT 10.0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type          VARCHAR(50) DEFAULT 'LOGISTICA_GENERAL';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cover_image_url        TEXT;

-- Coordenadas de los comercios demo (solo si aún no las tienen)
UPDATE tenants
   SET lat = -12.0782, lng = -77.0854, max_delivery_radius_km = 12.0
 WHERE slug = 'fuego-carbon' AND lat IS NULL;

UPDATE tenants
   SET lat = -12.1215, lng = -77.0298, max_delivery_radius_km = 15.0
 WHERE slug = 'libreria-atenea' AND lat IS NULL;
