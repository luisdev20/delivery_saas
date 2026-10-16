-- ============================================================
-- Migración 008: Autenticación real
--   * Credenciales de repartidor (contraseña hasheada) en tabla aparte
--     para NO exponer el hash en el SELECT * de `drivers`.
--   * RPC driver_login(): valida teléfono + contraseña en el servidor.
--   * RPC set_driver_password(): el comercio asigna/restablece la clave.
--   * Rol 'packing' admitido en tenant_users (usuarios de empaque).
--   * soft_delete_driver(): además elimina las credenciales del repartidor.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. Credenciales de repartidor (aisladas de la tabla drivers)
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_credentials (
    driver_id     UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    password_hash TEXT        NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Nadie puede leerla directamente (ni anon ni authenticated).
-- Solo las funciones SECURITY DEFINER acceden a ella.
ALTER TABLE driver_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE driver_credentials FROM anon, authenticated;

-- Contraseña inicial de demostración para los repartidores existentes.
-- (Se puede cambiar por repartidor desde el panel: "Restablecer contraseña".)
INSERT INTO driver_credentials (driver_id, password_hash)
SELECT d.id, extensions.crypt('demo1234', extensions.gen_salt('bf'))
  FROM drivers d
 WHERE d.deleted_at IS NULL
ON CONFLICT (driver_id) DO NOTHING;

-- ============================================================
-- 1b. Helper de autorización por comercio (NULL-safe)
--     Sin sesión, get_user_tenant_id() es NULL; una comparación
--     directa daría NULL y un IF NOT(NULL) NO bloquea. Con COALESCE
--     el resultado es siempre booleano y deniega correctamente.
-- ============================================================
CREATE OR REPLACE FUNCTION can_manage_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_superadmin()
      OR COALESCE(p_tenant_id IS NOT NULL AND p_tenant_id = get_user_tenant_id(), false);
$$;

-- ============================================================
-- 2. Rol 'packing' admitido para usuarios de empaque
-- ============================================================
ALTER TABLE tenant_users DROP CONSTRAINT IF EXISTS tenant_users_role_check;
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_role_check
    CHECK (role IN ('superadmin', 'owner', 'manager', 'dispatcher', 'packing'));

-- ============================================================
-- 3. RPC: login de repartidor (teléfono + contraseña)
--    Devuelve { success, driver } o { success:false, error }
-- ============================================================
CREATE OR REPLACE FUNCTION driver_login(p_identifier TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_phone  TEXT;
  v_hash   TEXT;
BEGIN
  v_phone := regexp_replace(COALESCE(p_identifier, ''), '\D', '', 'g');

  IF v_phone = '' OR COALESCE(p_password, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingresa tu teléfono y contraseña.');
  END IF;

  SELECT * INTO v_driver FROM drivers WHERE phone = v_phone LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No encontramos un repartidor con ese número.');
  END IF;

  IF v_driver.deleted_at IS NOT NULL OR v_driver.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario inactivo');
  END IF;

  SELECT password_hash INTO v_hash FROM driver_credentials WHERE driver_id = v_driver.id;
  IF v_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aún no tienes una contraseña asignada. Contacta a tu comercio.');
  END IF;

  IF extensions.crypt(p_password, v_hash) <> v_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contraseña incorrecta.');
  END IF;

  -- Nunca devolver el hash (aunque drivers ya no lo tiene, por claridad)
  RETURN jsonb_build_object('success', true, 'driver', to_jsonb(v_driver));
END;
$$;

GRANT EXECUTE ON FUNCTION driver_login(TEXT, TEXT) TO anon, authenticated;

-- ============================================================
-- 4. RPC: asignar / restablecer contraseña (dueño del comercio o superadmin)
-- ============================================================
CREATE OR REPLACE FUNCTION set_driver_password(p_driver_id UUID, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Repartidor no encontrado.');
  END IF;

  IF NOT can_manage_tenant(v_driver.tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado.');
  END IF;

  IF length(COALESCE(p_password, '')) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La contraseña debe tener al menos 6 caracteres.');
  END IF;

  INSERT INTO driver_credentials (driver_id, password_hash, updated_at)
  VALUES (p_driver_id, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
  ON CONFLICT (driver_id) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at    = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION set_driver_password(UUID, TEXT) TO authenticated;

-- ============================================================
-- 5. soft_delete_driver(): también elimina las credenciales
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

  IF NOT can_manage_tenant(v_driver.tenant_id) THEN
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

  -- Limpiar telemetría GPS y credenciales de acceso
  DELETE FROM driver_locations WHERE driver_id = p_driver_id;
  DELETE FROM driver_credentials WHERE driver_id = p_driver_id;

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
