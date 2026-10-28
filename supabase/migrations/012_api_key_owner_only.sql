-- ============================================================
-- 012 — Gestión de API keys restringida al owner
-- ------------------------------------------------------------
-- DEFENSA EN PROFUNDIDAD (requiere aplicación manual).
--
-- La API (`/api/v1/keys`) ya valida el rol en el servidor.
-- Esta migración replica la regla en PostgreSQL para que un
-- manager, dispatcher o packing no pueda leer, crear, pausar
-- ni revocar claves mediante acceso directo a Supabase.
--
-- Reglas:
--   * `owner` solo puede operar sobre las claves de su tenant.
--   * `superadmin` puede operar sobre cualquier tenant.
--   * El resto de roles queda sin acceso.
--
-- Es idempotente: puede ejecutarse varias veces.
-- ============================================================

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_owner_select" ON tenant_api_keys;
DROP POLICY IF EXISTS "api_keys_owner_all" ON tenant_api_keys;
DROP POLICY IF EXISTS "tenant_api_keys_owner_select" ON tenant_api_keys;
DROP POLICY IF EXISTS "tenant_api_keys_owner_all" ON tenant_api_keys;

CREATE POLICY "tenant_api_keys_owner_all"
ON tenant_api_keys
FOR ALL
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_api_keys.tenant_id
      AND tu.role = 'owner'
  )
)
WITH CHECK (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
      AND tu.tenant_id = tenant_api_keys.tenant_id
      AND tu.role = 'owner'
  )
);

COMMENT ON POLICY "tenant_api_keys_owner_all" ON tenant_api_keys IS
  'Solo el owner del tenant o un superadmin puede administrar claves API.';
