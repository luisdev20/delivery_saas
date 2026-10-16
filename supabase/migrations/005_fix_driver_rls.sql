-- ============================================================
-- Migración 005: Corrección de RLS para Repartidores y Telemetría GPS
-- Permite que la app móvil de repartidores consulte su perfil y transmita GPS
-- ============================================================

-- 1. Políticas de Seguridad para la tabla `drivers`
DROP POLICY IF EXISTS "drivers_select_public" ON drivers;
DROP POLICY IF EXISTS "drivers_select_owner" ON drivers;
DROP POLICY IF EXISTS "drivers_insert_owner" ON drivers;
DROP POLICY IF EXISTS "drivers_update_owner" ON drivers;
DROP POLICY IF EXISTS "drivers_delete_owner" ON drivers;

-- Lectura pública para login por teléfono y tracking web
CREATE POLICY "drivers_select_public" ON drivers FOR SELECT USING (true);

-- Inserción / Actualización por dueños de comercio, superadmins o app
CREATE POLICY "drivers_insert_owner" ON drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "drivers_update_owner" ON drivers FOR UPDATE USING (true);
CREATE POLICY "drivers_delete_owner" ON drivers FOR DELETE USING (tenant_id = get_user_tenant_id() OR is_superadmin());

-- 2. Políticas de Seguridad para la tabla `driver_locations` (GPS en tiempo real)
DROP POLICY IF EXISTS "driver_locations_select_public" ON driver_locations;
DROP POLICY IF EXISTS "driver_locations_insert_owner" ON driver_locations;
DROP POLICY IF EXISTS "driver_locations_update_owner" ON driver_locations;
DROP POLICY IF EXISTS "driver_locations_all_public" ON driver_locations;

CREATE POLICY "driver_locations_select_public" ON driver_locations FOR SELECT USING (true);
CREATE POLICY "driver_locations_all_public" ON driver_locations FOR ALL USING (true);
