# Guía de Inicialización — Delivery Tracker (Next.js + Flutter + Supabase)

Motor logístico B2B (SaaS/DaaS) **agnóstico al rubro**: despacha pedidos de cualquier tipo de
comercio (restaurantes, librerías, farmacias, retail, etc.). Ver `README.md` para el detalle funcional.

---

## 1. Estructura del monorepo

```text
delivery_saas/
├── apps/
│   ├── web/                 # Next.js 16 — consola admin, superadmin, empaque (packing), tracking y APIs B2B
│   ├── mobile_driver/       # Flutter — app del repartidor (login por teléfono + contraseña, pool, ruta activa)
│   ├── store_restaurante/   # Tienda demo B2B "Fuego & Carbón"  (cliente de la API) — puerto 3001
│   └── store_libreria/      # Tienda demo B2B "Librería Atenea" (cliente de la API) — puerto 3002
├── supabase/
│   ├── migrations/          # 001 → 012 (se aplican a mano, en orden)
│   ├── demo/                # utilidades de demo (p. ej. repartos frescos)
│   └── seed.sql             # datos demo idempotentes
├── .env.example
├── README.md
└── SETUP.md
```

> No hay `supabase/config.toml` ni historial del CLI: las migraciones se aplican manualmente
> en el SQL Editor de Supabase, en orden numérico.

---

## 2. Requisitos

- **Node.js** 20+ y **npm** 10+
- **Flutter** 3.x (con Android SDK y un emulador o dispositivo)
- Un proyecto de **Supabase**

---

## 3. Instalar dependencias (workspaces)

```bash
npm install
```

Esto instala las dependencias de `apps/web` y de las tiendas demo. La app Flutter se resuelve aparte.

---

## 4. Base de datos

En el **SQL Editor** de tu proyecto Supabase:

1. Ejecuta, en orden, cada archivo de `supabase/migrations/`:

   ```text
   001_initial_schema.sql → 002_multitenant.sql → 003_daas_state_machine_and_api.sql
   → 004_refactor_to_tenant_daas.sql → 005_fix_driver_rls.sql
   → 006_order_cancellation_rpc.sql → 007_driver_lifecycle.sql
   → 008_auth_driver_credentials.sql → 009_tenants_missing_columns.sql
   → 010_order_status_timestamps.sql → 011_subscription_governance.sql
   → 012_api_key_owner_only.sql
   ```

2. Ejecuta `supabase/seed.sql` (crea los comercios, repartidores y credenciales demo).

3. Crea las **cuentas de acceso web** (Supabase Auth → Authentication → Users) y enlázalas en
   `tenant_users` con su rol:

   ```sql
   INSERT INTO tenant_users (user_id, tenant_id, role) VALUES
     ('<uuid-de-auth>', '00000000-0000-0000-0000-000000000002', 'owner');
   ```

   Roles: `superadmin` (acceso global), `owner` (dueño del comercio), `packing` (estación de empaque).

---

## 5. Variables de entorno

**Web** — crea `apps/web/.env.local` (basado en `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>          # o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>       # solo servidor; nunca exponer al cliente
NEXT_PUBLIC_APP_NAME="DeliveryOS"
```

**App móvil** — copia `apps/mobile_driver/.env.example` a `apps/mobile_driver/.env`:

```env
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

Los archivos `.env` y `.env.local` están en `.gitignore`.

---

## 6. Ejecutar

```bash
# Web + tiendas demo en paralelo (turbo)
npm run dev
#   web                → http://localhost:3000
#   Fuego & Carbón     → http://localhost:3001
#   Librería Atenea    → http://localhost:3002

# Tiendas demo por separado
npm run demo:restaurante
npm run demo:libreria
```

> **Clave de las tiendas demo:** cada tienda necesita `apps/store_<tienda>/.env` con
> `DELIVERY_API_KEY=dtk_live_…` (cópialo de `.env.example`). Genera la clave en la consola del
> comercio (*Configuración del Negocio → Integraciones API → Generar clave*, solo `owner` o
> `superadmin`). El `server.js` de la tienda hace de **proxy**, por lo que la clave nunca se expone
> al navegador.

**App del repartidor:**

```bash
cd apps/mobile_driver
flutter run -d emulator-5554 --dart-define-from-file=.env
```

---

## 7. Rutas principales

| Ruta | Tipo | Descripción |
|---|:--:|---|
| `POST /api/v1/orders` | API B2B | Crear despacho (requiere `x-api-key`). |
| `GET /api/v1/orders/[id]` | API B2B | Estado, telemetría GPS y bitácora. |
| `POST /api/v1/orders/[id]` | API B2B | Cancelación estructurada con motivo (misma RPC que cliente/repartidor). |
| `POST /api/v1/quotes` | API B2B | Cotización de envío. |
| `GET/POST/PATCH/DELETE /api/v1/keys` | API | Gestión de claves B2B (owner/superadmin). |
| `/admin` | Web | Consola de despacho (pedidos, flota, suscripción, métricas y configuración). |
| `/superadmin` | Web | Consola de superadmin (todos los comercios). |
| `/packing/[slug]` | Web | Estación de empaque / preparación. |
| `/tracking/[orderId]` | Web | Seguimiento para el cliente (PIN anti-fraude). |
| `/onboarding` | Web | Alta de nuevos comercios. |
| `/login` | Web | Acceso por Supabase Auth (rol derivado de `tenant_users`). |

---

## 8. Datos y cuentas demo

**Comercios:** `fuego-carbon` (id `…0001`) y `libreria-atenea` (id `…0002`).

**Repartidores demo** (login en la app: teléfono + contraseña):

| Teléfono | Repartidor | Comercio |
|---|---|---|
| `942000001` | Jorge Mendoza | Librería Atenea |
| `942000002` | Diego Salazar | Librería Atenea |
| `941000001` | Carlos Rios | Fuego & Carbón |
| `941000002` | Miguel Torres | Fuego & Carbón |

> Las cuentas y repartidores **demo** usan la contraseña `demo1234`. En un entorno real, las
> contraseñas se definen desde el panel (acción **Contraseña**) y se guardan hasheadas con
> `pgcrypto` en `driver_credentials` — nunca en texto plano.

**Cuentas web demo:** `admin@fuego-carbon.com` (owner), `admin@libreria-atenea.com` (owner),
`empaque@libreria-atenea.com` (packing), `admin@saas.com` (superadmin).

**Repartos de prueba:** para no arrastrar tiempos de espera, ejecuta
`supabase/demo/crear_repartos_frescos.sql` el mismo día de la presentación.
