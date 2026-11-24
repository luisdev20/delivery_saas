-- ============================================================
-- 013 — Retención de datos y purga definitiva de cuentas
-- ------------------------------------------------------------
-- Política contractual de la plataforma:
--
--   * Al vencer el ciclo (trial 14 días / plan pagado 1 mes) el
--     servicio se suspende y el panel pasa a modo solo lectura.
--   * Los datos se conservan 30 días adicionales.
--   * En los últimos 7 días se emite el aviso previo de
--     eliminación al propietario de la cuenta.
--   * Cumplido el plazo, la purga elimina el comercio con todas
--     sus dependencias en cascada y las cuentas de acceso que
--     queden sin membresía.
--
-- La aplicación calcula el cronograma (`src/lib/retention.ts`) y
-- ejecuta la purga con `service_role` desde el trabajo programado
-- `/api/cron/retention`. Esta migración aporta el estado operativo
-- y la auditoría que sobrevive a la eliminación del comercio.
--
-- Es idempotente: puede ejecutarse varias veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estado operativo de retención por comercio
-- ------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS retention_extended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_hold BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.retention_extended_until IS
  'Prórroga manual del plazo de retención otorgada por superadmin.';
COMMENT ON COLUMN tenants.retention_hold IS
  'Excluye al comercio de la purga automática (cuenta resguardada).';

-- ------------------------------------------------------------
-- 2. Auditoría de avisos y purgas
--    Sin clave foránea a propósito: el registro debe sobrevivir
--    a la eliminación del comercio.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_retention_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  tenant_name  TEXT NOT NULL,
  tenant_slug  TEXT NOT NULL,
  event_type   TEXT NOT NULL
               CHECK (event_type IN ('NOTICE', 'FINAL_NOTICE', 'PURGED', 'EXTENDED', 'HOLD', 'RELEASED')),
  channel      TEXT NOT NULL DEFAULT 'IN_APP'
               CHECK (channel IN ('IN_APP', 'EMAIL')),
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_retention_events_tenant_idx
  ON tenant_retention_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_retention_events_type_idx
  ON tenant_retention_events (event_type, created_at DESC);

ALTER TABLE tenant_retention_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_retention_events_superadmin" ON tenant_retention_events;
CREATE POLICY "tenant_retention_events_superadmin" ON tenant_retention_events
  FOR SELECT USING (is_superadmin());

-- ------------------------------------------------------------
-- 3. Fuente única del fin de ciclo facturado
--    Replica la regla de la aplicación para consultas y
--    reportes ejecutados directamente en SQL.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tenant_billing_period_end(p_tenant_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub      subscriptions%ROWTYPE;
  v_is_trial BOOLEAN := false;
  v_start    TIMESTAMPTZ;
BEGIN
  SELECT *
    INTO v_sub
    FROM subscriptions
   WHERE tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT created_at INTO v_start FROM tenants WHERE id = p_tenant_id;
    RETURN v_start;
  END IF;

  SELECT (payment_method = 'TRIAL')
    INTO v_is_trial
    FROM billing_transactions
   WHERE tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  v_start := v_sub.billing_cycle_start::timestamptz;

  IF COALESCE(v_is_trial, false) THEN
    RETURN v_start + INTERVAL '14 days';
  END IF;

  RETURN v_start + INTERVAL '1 month';
END;
$$;

COMMENT ON FUNCTION tenant_billing_period_end(UUID) IS
  'Fin del ciclo facturado: trial 14 días, plan pagado 1 mes desde billing_cycle_start.';

-- ------------------------------------------------------------
-- 4. Línea base de despliegue
--    Las cuentas que ya superaron su plazo al habilitar la
--    política reciben una prórroga única de 30 días. Evita que la
--    primera ejecución del cron elimine cuentas heredadas sin
--    haber recibido antes los avisos correspondientes.
-- ------------------------------------------------------------
UPDATE tenants t
   SET retention_extended_until = NOW() + INTERVAL '30 days'
 WHERE t.retention_extended_until IS NULL
   AND tenant_billing_period_end(t.id) + INTERVAL '30 days' <= NOW();

-- ------------------------------------------------------------
-- 5. Contrato de la política para el equipo
-- ------------------------------------------------------------
COMMENT ON TABLE tenant_retention_events IS
  'Avisos previos y purgas definitivas. Conserva solo metadatos mínimos del comercio eliminado.';
