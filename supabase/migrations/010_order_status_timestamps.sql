-- ============================================================================
-- 010: Marcas de tiempo de estado de la orden (trazabilidad consistente)
-- ----------------------------------------------------------------------------
-- Motivo: la app Flutter (repartidor) al aceptar sólo escribía driver_id +
--   status='EN_CAMINO' (dejaba assigned_at / in_route_at en NULL) y al
--   entregar enviaba delivered_at con la hora LOCAL del teléfono sin zona
--   (Lima, UTC-5), que Postgres guardaba como si fuese UTC. Resultado: ciclos
--   negativos (delivered_at < created_at) y métricas de tiempo incorrectas.
--
-- Solución: un trigger BEFORE UPDATE fija los timestamps en cada transición
--   de estado usando la hora del servidor (UTC). Es la fuente autoritativa,
--   sin importar el cliente (app Flutter, panel web o API B2B).
--   - -> EN_CAMINO : assigned_at (si falta) e in_route_at
--   - -> ENTREGADO : delivered_at
--   - -> CANCELADO : cancelled_at (si el RPC no lo fijó)
-- ============================================================================

CREATE OR REPLACE FUNCTION orders_stamp_status_times()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'EN_CAMINO' THEN
      NEW.assigned_at := COALESCE(NEW.assigned_at, now());
      NEW.in_route_at := now();
    ELSIF NEW.status = 'ENTREGADO' THEN
      NEW.delivered_at := now();
    ELSIF NEW.status = 'CANCELADO' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_stamp_status_times ON orders;
CREATE TRIGGER trg_orders_stamp_status_times
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION orders_stamp_status_times();
