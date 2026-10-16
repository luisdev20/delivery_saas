-- ============================================================
-- Repartos frescos para demo
-- ------------------------------------------------------------
-- Ejecutar EL DÍA DE LA PRESENTACIÓN (no antes).
--
-- Problema que resuelve: los repartos que quedan en estado
-- "en curso" (RECIBIDO / EN_PREPARACION / LISTO / EN_CAMINO)
-- acumulan tiempo de espera desde created_at. Si se crean con
-- días de antelación, el monitor y el pool muestran contadores
-- de decenas o cientos de horas.
--
-- Este script:
--   1. Borra los repartos "en curso" del comercio indicado.
--   2. Crea 6 repartos nuevos, todos con created_at = now(),
--      repartidos entre los repartidores activos.
--
-- No contiene credenciales. Se puede pegar en el SQL Editor de
-- Supabase (o ejecutar con psql).
-- ============================================================

DO $fresh$
DECLARE
  v_tenant  uuid := '00000000-0000-0000-0000-000000000002'; -- Librería Atenea
  v_drivers uuid[];
  v_plan    text[] := ARRAY['RECIBIDO','RECIBIDO','EN_PREPARACION','LISTO','EN_CAMINO','EN_CAMINO'];
  v_names   text[] := ARRAY['María Fernández','José Gutiérrez','Lucía Ramírez','Carlos Mendoza','Ana Torres','Pedro Castillo'];
  v_addrs   text[] := ARRAY['Av. Arequipa 1234, Lince','Av. Larco 789, Miraflores','Av. Brasil 1500, Jesús María','Calle Los Álamos 321, San Isidro','Av. Benavides 3456, Surco','Av. La Marina 789, San Miguel'];
  v_status  order_status;
  v_driver  uuid;
  v_created timestamptz;
  v_i int;
BEGIN
  SELECT array_agg(id ORDER BY name) INTO v_drivers
    FROM drivers
   WHERE tenant_id = v_tenant AND is_active AND deleted_at IS NULL;

  IF v_drivers IS NULL OR array_length(v_drivers, 1) = 0 THEN
    RAISE EXCEPTION 'No hay repartidores activos en el comercio %', v_tenant;
  END IF;

  -- 1. Quita los "en curso" previos para no arrastrar tiempos de espera viejos
  DELETE FROM orders
   WHERE tenant_id = v_tenant
     AND status IN ('RECIBIDO','EN_PREPARACION','LISTO','EN_CAMINO');

  -- 2. Crea los nuevos, todos nacidos "ahora"
  FOR v_i IN 1..array_length(v_plan, 1) LOOP
    v_status  := v_plan[v_i]::order_status;
    v_created := now() - (floor(random()*25) || ' minutes')::interval;

    IF v_status = 'RECIBIDO' OR v_status = 'EN_PREPARACION' THEN
      v_driver := NULL; -- aún sin asignar: aparecen en el pool / estación de empaque
    ELSE
      v_driver := v_drivers[1 + floor(random()*array_length(v_drivers,1))];
    END IF;

    INSERT INTO orders (
      tenant_id, driver_id, customer_name, customer_phone, delivery_address,
      delivery_lat, delivery_lng, status, payment_method, total_amount,
      created_at, assigned_at, in_route_at, origin_system
    ) VALUES (
      v_tenant, v_driver,
      v_names[1 + floor(random()*array_length(v_names,1))],
      '9' || lpad((floor(random()*100000000))::text, 8, '0'),
      v_addrs[1 + floor(random()*array_length(v_addrs,1))],
      -12.05 + (random()-0.5)*0.12,
      -77.03 + (random()-0.5)*0.12,
      v_status,
      (ARRAY['EFECTIVO','YAPE','PLIN']::payment_method[])[1 + floor(random()*3)],
      round((random()*235 + 15)::numeric, 2),
      v_created,
      CASE WHEN v_status IN ('LISTO','EN_CAMINO') THEN v_created + interval '3 minutes' END,
      CASE WHEN v_status = 'EN_CAMINO' THEN v_created + interval '6 minutes' END,
      'MANUAL'
    );
  END LOOP;
END
$fresh$;

-- Verificación
SELECT status, count(*) FROM orders
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002'
   AND status IN ('RECIBIDO','EN_PREPARACION','LISTO','EN_CAMINO')
 GROUP BY status ORDER BY status;
