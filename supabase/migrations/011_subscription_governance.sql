-- ============================================================
-- 011 — Gobierno de suscripciones, cuotas y personal operativo
-- ------------------------------------------------------------
-- DEFENSA EN PROFUNDIDAD (requiere aplicación manual).
--
-- La aplicación ya valida estos límites en el servidor
-- (`/api/admin/*`, `/api/v1/orders`) con `service_role`. Esta
-- migración replica las reglas en PostgreSQL para proteger la
-- base de datos frente a escrituras directas, errores de la API
-- o integraciones futuras.
--
-- Reglas:
--   * Toda orden nueva exige una suscripción vigente y cuota
--     disponible (trial: 14 días; pago: 1 mes desde el ciclo).
--   * No se puede activar un motorizado por encima de
--     `subscriptions.max_drivers`.
--   * `billing_transactions` queda auditada y aislada por tenant.
--   * `tenants.ruc` se valida como DNI (8) o RUC (11).
--
-- Es idempotente: puede ejecutarse varias veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas de identidad fiscal y estado operativo
-- ------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ruc     VARCHAR(11);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_ruc_format_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_ruc_format_check
      CHECK (ruc IS NULL OR ruc ~ '^([0-9]{8}|[0-9]{11})$') NOT VALID;
  END IF;
END $$;

-- El KDS usa el rol operativo `packing` (Auth + tenant_users) y
-- solo puede acceder a /packing. Alinea la restricción local.
ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS tenant_users_role_check;
ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('superadmin', 'owner', 'manager', 'dispatcher', 'packing')) NOT VALID;

-- ------------------------------------------------------------
-- 2. Auditoría financiera (si el entorno aún no la tiene)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_selected      VARCHAR(20) NOT NULL,
  amount_pen         NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method     VARCHAR(20) NOT NULL
                     CHECK (payment_method IN ('YAPE', 'TARJETA', 'TRIAL')),
  card_last_four     VARCHAR(4),
  yape_phone_number  VARCHAR(9),
  transaction_code   VARCHAR(50) NOT NULL UNIQUE,
  status             VARCHAR(20) NOT NULL DEFAULT 'PAID',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_transactions_tenant_created_idx
  ON billing_transactions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_tenant_created_idx
  ON subscriptions (tenant_id, created_at DESC);

ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_transactions_select_owner" ON billing_transactions;
DROP POLICY IF EXISTS "billing_transactions_superadmin_all" ON billing_transactions;

CREATE POLICY "billing_transactions_select_owner" ON billing_transactions
  FOR SELECT USING (tenant_id = get_user_tenant_id() OR is_superadmin());

CREATE POLICY "billing_transactions_superadmin_all" ON billing_transactions
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ------------------------------------------------------------
-- 3. Políticas de suscripciones alineadas a `tenant_id`
--    (002 las definió con `restaurant_id`, renombrado en 004).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "subscriptions_select_owner" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_insert_superadmin" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_superadmin" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_tenant" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_superadmin_all" ON subscriptions;

CREATE POLICY "subscriptions_select_tenant" ON subscriptions
  FOR SELECT USING (tenant_id = get_user_tenant_id() OR is_superadmin());

CREATE POLICY "subscriptions_superadmin_all" ON subscriptions
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ------------------------------------------------------------
-- 4. Helper: ¿la suscripción del tenant está vigente?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION subscription_is_usable(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub       subscriptions%ROWTYPE;
  v_is_trial  BOOLEAN := false;
  v_period_end TIMESTAMPTZ;
BEGIN
  SELECT *
    INTO v_sub
    FROM subscriptions
   WHERE tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND OR v_sub.is_active IS FALSE THEN
    RETURN false;
  END IF;

  -- El trial se reconoce por la última transacción de facturación.
  SELECT (payment_method = 'TRIAL')
    INTO v_is_trial
    FROM billing_transactions
   WHERE tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF COALESCE(v_is_trial, false) THEN
    v_period_end := v_sub.billing_cycle_start::timestamptz + INTERVAL '14 days';
  ELSE
    v_period_end := (v_sub.billing_cycle_start + INTERVAL '1 month')::timestamptz;
  END IF;

  RETURN COALESCE(NOW() < v_period_end, false);
END;
$$;

-- ------------------------------------------------------------
-- 5. Guard de creación de órdenes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_order_subscription_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(subscription_is_usable(NEW.tenant_id), false) THEN
    RAISE EXCEPTION
      'Suscripción vencida o inactiva: no se pueden crear nuevos pedidos.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_sub
    FROM subscriptions
   WHERE tenant_id = NEW.tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_sub.max_orders_per_month > 0
     AND v_sub.orders_this_month >= v_sub.max_orders_per_month THEN
    RAISE EXCEPTION
      'Cuota mensual de pedidos alcanzada (% / %).',
      v_sub.orders_this_month,
      v_sub.max_orders_per_month
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_subscription_guard ON orders;
CREATE TRIGGER trg_orders_subscription_guard
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_subscription_guard();

-- ------------------------------------------------------------
-- 6. Guard de cupo de motorizados
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_driver_quota_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_active_count INTEGER;
BEGIN
  -- Solo se valida al incorporar/activar un motorizado vigente.
  IF NEW.is_active IS NOT TRUE OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_active IS TRUE AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_sub
    FROM subscriptions
   WHERE tenant_id = NEW.tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  -- Sin suscripción se permite el alta desde backoffice; la app
  -- mantiene el modo solo lectura y la API exige suscripción.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(subscription_is_usable(NEW.tenant_id), false) THEN
    RAISE EXCEPTION
      'Suscripción vencida o inactiva: no se puede activar personal operativo.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM drivers
   WHERE tenant_id = NEW.tenant_id
     AND is_active IS TRUE
     AND deleted_at IS NULL
     AND id <> NEW.id;

  IF v_sub.max_drivers > 0 AND v_active_count >= v_sub.max_drivers THEN
    RAISE EXCEPTION
      'Límite de motorizados activos alcanzado (% / %).',
      v_active_count,
      v_sub.max_drivers
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_quota_guard ON drivers;
CREATE TRIGGER trg_drivers_quota_guard
  BEFORE INSERT OR UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION enforce_driver_quota_guard();

-- ------------------------------------------------------------
-- 7. Comentarios de contrato para el equipo
-- ------------------------------------------------------------
COMMENT ON TABLE billing_transactions IS
  'Auditoría de cobros de suscripción. La escritura se realiza server-side con service_role.';
COMMENT ON FUNCTION subscription_is_usable(UUID) IS
  'Vigencia contractual: trial 14 días, plan pagado 1 mes desde billing_cycle_start.';
