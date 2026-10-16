-- ============================================================================
-- 006: Cancelación de órdenes por Cliente y Repartidor (RPC centralizada)
-- ----------------------------------------------------------------------------
-- - Trazabilidad: quién canceló (cancelled_by) y cuándo (cancelled_at).
-- - Soporte de "reclamo" post-entrega del cliente (no cambia el estado).
-- - Una sola vía de ejecución: función cancel_order(...) usada por la app
--   Flutter (repartidor) y por la página de tracking (cliente).
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claimed_at   TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_cancelled_by_check;
ALTER TABLE orders ADD CONSTRAINT orders_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('CLIENTE', 'REPARTIDOR', 'TIENDA', 'SISTEMA'));

-- ---------------------------------------------------------------------------
-- cancel_order: valida el origen/estado y aplica la cancelación o el reclamo.
--   p_source: 'CLIENTE' | 'REPARTIDOR' | 'TIENDA'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id    uuid,
  p_source      text,
  p_reason_code text,
  p_notes       text DEFAULT NULL,
  p_driver_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order  orders%ROWTYPE;
  v_reason text;
  v_notes  text;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada.');
  END IF;

  -- Catálogo de motivos (texto legible que se persiste)
  v_reason := CASE p_reason_code
    -- Cliente
    WHEN 'CUSTOMER_NO_LONGER_WANTS' THEN 'Ya no deseo el pedido (se le cobrará el cargo del envío)'
    WHEN 'CUSTOMER_BAD_CONDITION'   THEN 'El pedido llegó en mal estado'
    WHEN 'CUSTOMER_OTHER'           THEN 'Otro (cliente)'
    -- Repartidor
    WHEN 'DRIVER_CLIENT_REFUSED'    THEN 'El cliente se rehusó a recibir el pedido'
    WHEN 'DRIVER_NO_SHOW'           THEN 'No salieron a recibir el pedido'
    WHEN 'DRIVER_CANT_REACH'        THEN 'No me es posible llegar al destino'
    WHEN 'DRIVER_OTHER'             THEN 'Otros (repartidor)'
    -- Tienda / admin (compatibilidad con el catálogo existente)
    WHEN 'QUIEBRE_STOCK'            THEN 'Quiebre de stock / Paquete no disponible'
    WHEN 'DIRECCION_INVALIDA'       THEN 'Dirección de entrega inválida o inalcanzable'
    WHEN 'CLIENTE_CANCELO'          THEN 'El cliente solicitó cancelación del despacho'
    WHEN 'FUERA_DE_COBERTURA'       THEN 'Ubicación fuera del radio de entrega'
    WHEN 'TIEMPO_EXCEDIDO'          THEN 'Capacidad operativa excedida'
    WHEN 'OTRO'                     THEN 'Otro motivo logístico'
    ELSE NULL
  END;

  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo de cancelación no válido.');
  END IF;

  -- El motivo debe corresponder al actor que cancela
  IF p_source = 'REPARTIDOR' AND p_reason_code NOT IN
       ('DRIVER_CLIENT_REFUSED', 'DRIVER_NO_SHOW', 'DRIVER_CANT_REACH', 'DRIVER_OTHER') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo no válido para el repartidor.');
  END IF;
  IF p_source = 'CLIENTE' AND p_reason_code NOT IN
       ('CUSTOMER_NO_LONGER_WANTS', 'CUSTOMER_BAD_CONDITION', 'CUSTOMER_OTHER') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motivo no válido para el cliente.');
  END IF;

  v_notes := NULLIF(trim(coalesce(p_notes, '')), '');
  IF v_notes IS NOT NULL THEN
    v_reason := v_reason || ': ' || v_notes;
  END IF;

  -- Reglas de negocio por actor
  IF p_source = 'REPARTIDOR' THEN
    IF v_order.status <> 'EN_CAMINO' THEN
      RETURN jsonb_build_object('success', false, 'error', 'El repartidor solo puede cancelar una entrega en curso.');
    END IF;
    IF p_driver_id IS NULL OR v_order.driver_id IS DISTINCT FROM p_driver_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'El repartidor no coincide con la orden.');
    END IF;

  ELSIF p_source = 'CLIENTE' THEN
    IF v_order.status = 'ENTREGADO' THEN
      -- Post-entrega: se registra como reclamo, NO se cancela la orden
      UPDATE orders SET claim_reason = v_reason, claimed_at = now() WHERE id = p_order_id;
      RETURN jsonb_build_object('success', true, 'outcome', 'RECLAMO', 'reason', v_reason);
    END IF;
    IF v_order.status = 'CANCELADO' THEN
      RETURN jsonb_build_object('success', false, 'error', 'La orden ya fue cancelada.');
    END IF;

  ELSIF p_source = 'TIENDA' THEN
    IF v_order.status = 'ENTREGADO' THEN
      RETURN jsonb_build_object('success', false, 'error', 'No se puede cancelar una orden ya entregada.');
    END IF;
    IF v_order.status = 'CANCELADO' THEN
      RETURN jsonb_build_object('success', false, 'error', 'La orden ya fue cancelada.');
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Origen de cancelación inválido.');
  END IF;

  -- Liberar la telemetría del repartidor asociada a esta orden
  UPDATE driver_locations
     SET current_order_id = NULL, updated_at = now()
   WHERE current_order_id = p_order_id;

  UPDATE orders
     SET status              = 'CANCELADO',
         cancellation_reason = v_reason,
         cancelled_by        = p_source,
         cancelled_at        = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'outcome', 'CANCELADO', 'reason', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order(uuid, text, text, text, uuid) TO anon, authenticated;
