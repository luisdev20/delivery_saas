-- ============================================================
-- 013 — Gobernanza Superadmin, Prórrogas y Notificaciones Realtime
-- ------------------------------------------------------------
-- Migración estrictamente ADITIVA y retrocompatible.
-- No altera contratos de Billing Portal (`provision_new_tenant`),
-- ni APIs B2B (`/api/v1/*`), ni la app móvil (`mobile_driver`).
--
-- Es idempotente: puede ejecutarse varias veces sin errores.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas de suspensión de plataforma en `tenants`
--    (Separa la suspensión administrativa del interruptor
--     operativo diario `tenants.is_open` del negocio.)
-- ------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_suspended     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT NULL;

-- ------------------------------------------------------------
-- 2. Columnas de prórroga / días de gracia en `subscriptions`
-- ------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_until  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS grace_reason TEXT NULL;

-- ------------------------------------------------------------
-- 3. Tabla de notificaciones internas (Superadmin -> Admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'GENERAL'
             CHECK (type IN (
               'SUBSCRIPTION_EXPIRING',
               'SUBSCRIPTION_EXPIRED',
               'GRACE_GRANTED',
               'ACCOUNT_STATUS',
               'GENERAL'
             )),
  severity   TEXT NOT NULL DEFAULT 'INFO'
             CHECK (severity IN ('INFO', 'WARNING', 'URGENT')),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_notifications_tenant_created
  ON public.tenant_notifications (tenant_id, created_at DESC);

ALTER TABLE public.tenant_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_notifications_select" ON public.tenant_notifications;
DROP POLICY IF EXISTS "tenant_notifications_update_read" ON public.tenant_notifications;
DROP POLICY IF EXISTS "tenant_notifications_insert_superadmin" ON public.tenant_notifications;

CREATE POLICY "tenant_notifications_select" ON public.tenant_notifications
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.is_superadmin());

CREATE POLICY "tenant_notifications_update_read" ON public.tenant_notifications
  FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.get_user_tenant_id() OR public.is_superadmin());

CREATE POLICY "tenant_notifications_insert_superadmin" ON public.tenant_notifications
  FOR INSERT
  WITH CHECK (public.is_superadmin());

-- Habilitar Realtime (WebSockets) para notificaciones en vivo en el Panel Admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'tenant_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_notifications;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Alinear `subscription_is_usable(UUID)` con suspensión y prórroga
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_is_usable(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspended  BOOLEAN := false;
  v_sub        subscriptions%ROWTYPE;
  v_is_trial   BOOLEAN := false;
  v_period_end TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(is_suspended, false)
    INTO v_suspended
    FROM tenants
   WHERE id = p_tenant_id;

  IF v_suspended IS TRUE THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_sub
    FROM subscriptions
   WHERE tenant_id = p_tenant_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND OR v_sub.is_active IS FALSE THEN
    RETURN false;
  END IF;

  -- Si existe prórroga activa otorgada por Superadmin, permitir operación
  IF v_sub.grace_until IS NOT NULL AND NOW() < v_sub.grace_until THEN
    RETURN true;
  END IF;

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

COMMENT ON TABLE public.tenant_notifications IS
  'Notificaciones internas enviadas por Superadmin al panel administrativo del comercio.';
COMMENT ON FUNCTION public.subscription_is_usable(UUID) IS
  'Vigencia contractual: valida cuenta no suspendida, suscripción activa, prórroga vigente o ciclo activo.';
