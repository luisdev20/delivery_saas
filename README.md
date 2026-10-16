# Delivery Tracker — Motor Logístico B2B SaaS (DaaS)

**Delivery Tracker** es una plataforma tecnológica B2B bajo el modelo **SaaS / DaaS (Delivery as a Service)** diseñada para resolver la gestión logística de última milla. Actúa como un motor de despachos agnóstico que permite a comercios de cualquier rubro (restaurantes, librerías, farmacias, retail, ferreterías, repuestos) externalizar y digitalizar el rastreo satelital de sus envíos utilizando su propia flota de repartidores.

---

## Principios de la Arquitectura DaaS

1. **Agnosticidad de Dominio:** Aísla la logística de la venta. Despacha cualquier tipo de paquete o requerimiento sin acoplarse a catálogos ni recetas.
2. **Integración Plug & Play vía API REST B2B:** Los comercios envían requerimientos de entrega consumiendo `POST /api/v1/orders` con su `x-api-key`.
3. **Máquina de Estados Estricta (6 Estados):**
   * `RECIBIDO` ➔ `EN_PREPARACION` ➔ `LISTO` ➔ `EN_CAMINO` ➔ `ENTREGADO`.
   * Salida transversal a `CANCELADO`, con **cancelación trazable** (`cancelled_by`: cliente / repartidor / tienda) y motivo estructurado (`cancel_order`).
   * Después de la entrega, el cliente puede registrar un **reclamo** (no altera el estado del pedido).
4. **Validación Anti-Fraude con PIN de 4 Dígitos:** Cada orden genera un código PIN aleatorio; la entrega solo concluye cuando el destinatario proporciona su PIN al repartidor.
5. **Pagos en Soles (PEN):** `EFECTIVO`, `YAPE` o `PLIN`.
6. **Multi-tenant con Aislamiento:** Cada comercio (tenant) tiene su flota, sus API keys y su configuración; el acceso web se resuelve con Supabase Auth + `tenant_users`.
7. **Ciclo de Vida del Repartidor:** Alta con contraseña propia (hash `pgcrypto`), desactivación y **baja lógica** (conserva el historial de entregas).

---

## Rutas Principales de la Plataforma

| Ruta / Endpoint | Tipo | Descripción |
|---|:---:|---|
| **`POST /api/v1/orders`** | `API B2B` | Crear requerimiento de despacho (requiere cabecera `x-api-key`). |
| **`GET /api/v1/orders/[id]`** | `API B2B` | Consultar estado, telemetría GPS del motorizado y bitácora. |
| **`POST /api/v1/orders/[id]`** | `API B2B` | Cancelación estructurada con motivo (`QUIEBRE_STOCK`, `TIEMPO_EXCEDIDO`, …). |
| **`POST /api/v1/quotes`** | `API B2B` | Cotización de envío. |
| **`POST /api/v1/keys`** | `API` | Generación de tokens de acceso B2B (`dtk_live_...`). |
| **`/admin`** | `Web UI` | Consola de Despacho DaaS, Flota, Gestión de API Keys y Métricas. |
| **`/superadmin`** | `Web UI` | Consola de superadmin: todos los comercios de la plataforma. |
| **`/packing/[slug]`** | `Web UI` | Estación de Empaque y Preparación en tiempo real. |
| **`/tracking/[orderId]`** | `Web UI` | Pantalla de seguimiento satelital para el cliente con PIN de seguridad. |
| **`/onboarding`** | `Web UI` | Alta de nuevos comercios multi-tenant (super-admin). |
| **`/login`** | `Web UI` | Acceso por Supabase Auth (rol y comercio derivados de `tenant_users`). |

---

## Guía Rápida de Inicio para Desarrolladores

### 1. Clonar el repositorio e instalar dependencias

```bash
git clone https://github.com/luisdev20/delivery_saas.git
cd delivery_saas
npm install
```

### 2. Configurar Variables de Entorno

Crea el archivo `apps/web/.env.local` con las credenciales de Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

### 3. Ejecutar el Proyecto

```bash
npm run dev
```

La aplicación web estará disponible en **`http://localhost:3000`**, y las tiendas demo B2B en
**`http://localhost:3001`** (Fuego & Carbón) y **`http://localhost:3002`** (Librería Atenea).

> Las tiendas demo consumen la API con una **clave propia**: copia `apps/store_<tienda>/.env.example`
> a `.env` y pega la clave generada en el panel (*Integración API B2B → Generar Clave API*). El
> `server.js` de cada tienda actúa de **proxy** y añade la clave, por lo que el token nunca se expone
> al navegador.
>
> Para el detalle completo de base de datos, migraciones, seed, cuentas demo y app móvil, ver
> **[`SETUP.md`](./SETUP.md)**.

---

## Ejemplo Rápido de Creación de Despacho (cURL)

```bash
curl -X POST "http://localhost:3000/api/v1/orders" \
  -H "Content-Type: application/json" \
  -H "x-api-key: dtk_live_TU_CLAVE_AQUI" \
  -d '{
    "external_order_id": "ORD-1092",
    "customer": {
      "name": "Juan Perez",
      "phone": "+51987654321",
      "address": "Av. Principal 456, Lima",
      "reference": "Dpto 302",
      "lat": -12.1219,
      "lng": -77.0298
    },
    "items": [
      { "name": "Medicamentos / Zapatillas / Pedido", "quantity": 1, "unit_price": 45.00 }
    ],
    "payment": {
      "method": "EFECTIVO",
      "total_amount": 45.00
    },
    "notes": "Llamar al llegar"
  }'
```

---

## Integración B2B: cómo conectar tu negocio (ej. Librería Atenea)

1. **Genera una clave** en la consola: *Comercio → Integración API B2B → Generar Clave API*. Se
   muestra **una sola vez** (`dtk_live_…`); guárdala como variable de entorno del **servidor** del
   comercio (nunca en el navegador).
2. **(Opcional) Cotiza** antes de cerrar la venta: `POST /api/v1/quotes` →
   `delivery_fee`, `covered`, `estimated_time_minutes`.
3. **Crea el despacho**: `POST /api/v1/orders` con `x-api-key`. La respuesta incluye `order_id`,
   `order_number`, `pin_code` y `tracking_url`.
4. **Comparte** el `tracking_url` con el cliente (mapa en vivo + PIN anti-fraude).
5. **(Opcional) Consulta o cancela**: `GET /api/v1/orders/{id}` y `POST /api/v1/orders/{id}` con
   `{ "reason": "QUIEBRE_STOCK", "notes": "…" }`.

La autenticación es **exclusivamente** por `x-api-key`. Las tiendas demo (`apps/store_*`)
implementan este patrón **desde su propio servidor**: el `server.js` actúa de proxy y añade la clave,
de modo que el token nunca llega al navegador.

---

## Estructura del Monorepo

```text
delivery_SaaS/
├── apps/
│   ├── web/                     # Aplicación Next.js (Admin DaaS, Superadmin, APIs B2B, Packing, Tracking)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── admin/       # Consola de despacho logístico
│   │   │   │   ├── superadmin/  # Consola global de comercios
│   │   │   │   ├── api/v1/      # Endpoints REST B2B (/orders, /quotes, /keys)
│   │   │   │   ├── packing/     # Estación de empaque y preparación
│   │   │   │   ├── tracking/    # Rastreo satelital con PIN anti-fraude
│   │   │   │   └── onboarding/  # Asistente de alta de comercios
│   │   │   └── lib/             # Supabase client, sesión y Auth de API Keys
│   ├── mobile_driver/           # App móvil Flutter para repartidores
│   ├── store_restaurante/       # Tienda demo B2B "Fuego & Carbón" (puerto 3001, integrada vía proxy)
│   └── store_libreria/          # Tienda demo B2B "Librería Atenea" (puerto 3002, integrada vía proxy)
└── supabase/
    ├── migrations/              # 001 → 010 (esquema multi-tenant, DaaS, cancelaciones, ciclo de vida del repartidor y marcas de tiempo de estado)
    ├── demo/                    # utilidades de demo (repartos frescos)
    └── seed.sql                 # datos demo idempotentes
```
