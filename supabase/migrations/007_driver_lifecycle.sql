-- ============================================================
-- Migración 007: Ciclo de vida del repartidor
--   * Baja lógica (soft delete) conservando historial de entregas
--   * Bloqueo a nivel BD: un repartidor inactivo/dado de baja no
--     puede recibir (asignarse) pedidos
-- ============================================================

-- 1. Columna de baja lógica
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================
-- 2. Guardia: impedir asignar pedidos a repartidores inactivos o dados de baja
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_inactive_driver_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo evaluar cuando se asigna un repartidor (nuevo o distinto)
  IF NEW.driver_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id) THEN
    IF EXISTS (
      SELECT 1 FROM drivers
      WHERE id = NEW.driver_id
        AND (is_active IS NOT TRUE OR deleted_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'El repartidor no está activo.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_inactive_driver_assignment_ins ON orders;
CREATE TRIGGER trg_prevent_inactive_driver_assignment_ins
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION prevent_inactive_driver_assignment();

DROP TRIGGER IF EXISTS trg_prevent_inactive_driver_assignment_upd ON orders;
CREATE TRIGGER trg_prevent_inactive_driver_assignment_upd
  BEFORE UPDATE OF driver_id ON orders
  FOR EACH ROW EXECUTE FUNCTION prevent_inactive_driver_assignment();

-- ============================================================
-- 3. RPC: baja lógica de un repartidor
--    - Marca is_active = false y deleted_at = now()
--    - Borra teléfono y vínculo de login (user_id) para que no pueda ingresar
--    - Libera pedidos en curso y telemetría GPS
--    - CONSERVA la fila (y por tanto el historial de entregas vía orders.driver_id)
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_driver(p_driver_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_released INT := 0;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Repartidor no encontrado.');
  END IF;

  -- Autorización: dueño del comercio o superadmin
  IF NOT (is_superadmin() OR v_driver.tenant_id = get_user_tenant_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado.');
  END IF;

  IF v_driver.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El repartidor ya fue dado de baja.');
  END IF;

  -- Liberar pedidos en curso para que no queden colgados (vuelven a la bolsa)
  WITH released AS (
    UPDATE orders
    SET driver_id = NULL, status = 'LISTO'
    WHERE driver_id = p_driver_id AND status = 'EN_CAMINO'
    RETURNING 1
  )
  SELECT count(*) INTO v_released FROM released;

  -- Limpiar telemetría GPS
  DELETE FROM driver_locations WHERE driver_id = p_driver_id;

  -- Baja lógica + scrub de credenciales de acceso
  UPDATE drivers
  SET is_active  = false,
      deleted_at = now(),
      phone      = '',
      user_id    = NULL
  WHERE id = p_driver_id;

  RETURN jsonb_build_object('success', true, 'released_orders', v_released);
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_driver(UUID) TO authenticated;
