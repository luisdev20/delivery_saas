# Delivery Tracker — Motor Logístico B2B SaaS (DaaS)

**Delivery Tracker** es una plataforma tecnológica B2B bajo el modelo **SaaS / DaaS (Delivery as a Service)** diseñada para resolver la gestión logística de última milla. Actúa como un motor de despachos agnóstico que permite a comercios de cualquier rubro (restaurantes, farmacias, retail, repuestos, ferreterías) externalizar y digitalizar el rastreo satelital de sus envíos utilizando su propia flota de repartidores.

---

## Principios de la Arquitectura DaaS

1. **Agnosticidad de Dominio:** Aísla la logística de la venta. Despacha cualquier tipo de paquete o requerimiento sin acoplarse a catálogos ni recetas.
2. **Integración Plug & Play vía API REST B2B:** Los comercios envían requerimientos de entrega consumiendo `POST /api/v1/orders` con su `x-api-key`.
3. **Máquina de Estados Estricta (7 Estados):**
   * `RECIBIDO` ➔ `EN_PREPARACION` ➔ `LISTO_PARA_ENTREGA` ➔ `ASIGNADO` ➔ `EN_CAMINO` ➔ `ENTREGADO` (+ `CANCELADO` estructurado).
4. **Validación Anti-Fraude con PIN de 4 Dígitos:** Cada orden genera un código PIN aleatorio; la entrega solo concluye cuando el destinatario proporciona su PIN al repartidor.

---

## Rutas Principales de la Plataforma

| Ruta / Endpoint | Tipo | Descripción |
|---|:---:|---|
| **`POST /api/v1/orders`** | `API B2B` | Crear requerimiento de despacho (requiere cabecera `x-api-key`). |
| **`GET /api/v1/orders/[id]`** | `API B2B` | Consultar estado, telemetría GPS del motorizado y bitácora. |
| **`POST /api/v1/orders/[id]/cancel`** | `API B2B` | Cancelación estructurada con motivo (`QUIEBRE_STOCK`, etc.). |
| **`POST /api/v1/keys`** | `API` | Generación de tokens de acceso B2B (`dtk_live_...`). |
| **`/admin`** | `Web UI` | Consola de Despacho DaaS, Flota, Gestión de API Keys y Métricas. |
| **`/kds/[slug]`** | `Web UI` | Tablero de Empaque y Preparación en tiempo real para centros de fulfillment. |
| **`/tracking/[orderId]`** | `Web UI` | Pantalla de seguimiento satelital para el cliente con PIN de seguridad. |
| **`/onboarding`** | `Web UI` | Alta de nuevos comercios multi-tenant (super-admin). |

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
NEXT_PUBLIC_SUPABASE_URL=https://znqjggifhcldjnxrbcwt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

### 3. Ejecutar el Proyecto

```bash
npm run dev
```

La aplicación web estará disponible en **`http://localhost:3000`**.

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
      "method": "PAGADO_ORIGEN",
      "total_amount": 45.00
    },
    "notes": "Llamar al llegar"
  }'
```

---

## Estructura del Monorepo

```text
delivery_SaaS/
├── apps/
│   ├── web/                     # Aplicación Next.js (Admin DaaS, APIs B2B, KDS, Tracking)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── admin/       # Consola de despacho logístico
│   │   │   │   ├── api/v1/      # Endpoints REST B2B (/orders, /keys)
│   │   │   │   ├── kds/         # Tablero de empaque y preparación
│   │   │   │   ├── tracking/    # Rastreo satelital con PIN anti-fraude
│   │   │   │   └── onboarding/  # Asistente de alta de comercios
│   │   │   └── lib/             # Supabase client y Auth de API Keys
│   └── mobile_driver/           # App móvil Flutter para repartidores
└── supabase/
    └── migrations/              # 001_initial_schema, 002_multitenant, 003_daas_state_machine_and_api
```
