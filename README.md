# Delivery Tracker SaaS

Plataforma B2B para restaurantes y negocios gastronómicos que permite gestionar pedidos, monitorear la cocina (KDS), administrar la flota de repartidores y ofrecer seguimiento GPS en tiempo real a los clientes finales.

---

## Tabla de Contenidos

1. [Stack Tecnológico](#stack-tecnológico)
2. [Estructura del Repositorio](#estructura-del-repositorio)
3. [Requisitos Previos](#requisitos-previos)
4. [Guía de Instalación Paso a Paso](#guía-de-instalación-paso-a-paso)
   - [Paso 1: Clonar el repositorio e instalar dependencias](#paso-1-clonar-el-repositorio-e-instalar-dependencias)
   - [Paso 2: Configuración de la Base de Datos (Supabase)](#paso-2-configuración-de-la-base-de-datos-supabase)
   - [Paso 3: Variables de Entorno](#paso-3-variables-de-entorno)
   - [Paso 4: Ejecución en Desarrollo](#paso-4-ejecución-en-desarrollo)
5. [Rutas de la Aplicación](#rutas-de-la-aplicación)
6. [Flujo Operativo del Sistema](#flujo-operativo-del-sistema)
7. [Fases del Proyecto](#fases-del-proyecto)
8. [Reglas de Código y Contribución](#reglas-de-código-y-contribución)

---

## Stack Tecnológico

* **Frontend Web:** Next.js 14/16 (App Router), TypeScript, Tailwind CSS v4, Lucide Icons.
* **Mapas y Geolocalización:** Leaflet, OpenStreetMap.
* **Backend y Base de Datos:** Supabase (PostgreSQL, Supabase Auth, Supabase Realtime).
* **App Móvil (Fase 2):** Flutter (Android First).

---

## Estructura del Repositorio

```text
delivery_SaaS/
├── apps/
│   ├── web/                     # Aplicación web Next.js (Admin, Storefront, Tracking)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── admin/       # Panel de administración (Despacho, Flota, KDS, Menú)
│   │   │   │   ├── login/       # Acceso B2B
│   │   │   │   ├── p/[slug]/    # Menú público del restaurante y checkout
│   │   │   │   └── tracking/    # Pantalla de seguimiento en tiempo real
│   │   │   └── lib/supabase/    # Clientes de Supabase y definiciones de tipos
│   │   └── package.json
│   └── mobile_driver/           # App móvil Flutter para repartidores (Fase 2)
├── supabase/
│   └── migrations/              # Scripts SQL de esquema y tablas
│       ├── 001_initial_schema.sql
│       └── 002_add_cover_image.sql
├── ideas_de_prototipos/         # Prototipos interactivos de referencia UX/UI
├── package.json                 # Configuración del monorepo
└── README.md
```

---

## Requisitos Previos

Antes de comenzar, asegúrate de contar con:

1. **Node.js:** Versión 18.18 o superior (recomendado Node 20 LTS o Node 22).
2. **Gestor de paquetes:** `npm` (incluido con Node.js).
3. **Cuenta de Supabase:** Para crear la base de datos PostgreSQL y el servicio de autenticación.

---

## Guía de Instalación Paso a Paso

### Paso 1: Clonar el repositorio e instalar dependencias

1. Abre tu terminal y clona el proyecto:
   ```bash
   git clone https://github.com/luisdev20/delivery_saas.git delivery_SaaS
   cd delivery_SaaS
   ```

2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```

---

### Paso 2: Configuración de la Base de Datos (Supabase)

1. Ingresa a tu panel de control en [Supabase](https://supabase.com) y crea un nuevo proyecto.
2. Ve a la sección **SQL Editor** (icono de terminal en el menú lateral izquierdo).
3. Ejecuta en orden los scripts ubicados en la carpeta `supabase/migrations/`:
   * Copia y ejecuta el contenido de [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
   * Copia y ejecuta el contenido de [`supabase/migrations/002_add_cover_image.sql`](supabase/migrations/002_add_cover_image.sql).
4. **Habilitar Realtime:**
   * En Supabase, ve a **Database** -> **Replication**.
   * Asegúrate de que las tablas `orders` y `driver_locations` tengan habilitada la replicación para soportar actualizaciones en vivo.
5. **Crear Usuario Administrador:**
   * Ve a **Authentication** -> **Users** y haz clic en **Add User** -> **Create User**.
   * Ingresa el correo y contraseña del administrador (ejemplo: `admin@restaurante.com`).

---

### Paso 3: Variables de Entorno

1. En la carpeta `apps/web/`, crea un archivo llamado `.env.local` (puedes tomar como referencia el archivo `.env.example` en la raíz):

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon-publica
   ```

2. Puedes obtener estos valores en tu panel de Supabase en **Project Settings** -> **API**.

---

### Paso 4: Ejecución en Desarrollo

Para iniciar el servidor de desarrollo de la aplicación web:

```bash
# Desde la raíz del proyecto
npm run dev

# O directamente desde la carpeta apps/web
cd apps/web
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`.

---

## Rutas de la Aplicación

| Ruta | Descripción | Acceso |
|---|---|:---:|
| `/login` | Portal de acceso para administradores del restaurante. | Público |
| `/admin` | Panel de control unificado (Despachos, Flota, Cocina KDS, Menú). | Protegido (Requiere Login) |
| `/p/[slug]` | Tienda pública del restaurante para clientes (ej. `/p/el-rincon-criollo`). | Público |
| `/tracking/[orderId]` | Pantalla de seguimiento en tiempo real con mapa interactivo y estado del pedido. | Público |

---

## Flujo Operativo del Sistema

```text
[Cliente] Realiza pedido en /p/[slug]
   │
   ▼
[Supabase] Registra orden con estado "RECIBIDO"
   │
   ├──► [KDS / Cocina] Recibe notificación en tiempo real -> Pasa a "EN_PREPARACION" -> Pasa a "LISTO"
   │
   ├──► [Admin / Despacho] Asigna repartidor desde /admin
   │
   └──► [Repartidor / App] Acepta orden, inicia viaje ("EN_CAMINO") y actualiza GPS
           │
           ▼
   [Cliente / Tracking] Visualiza al repartidor en movimiento en /tracking/[orderId]
           │
           ▼
   [Entrega] Repartidor valida entrega ("ENTREGADO")
```

---

## Fases del Proyecto

* **Fase 1: MVP Core (Web + Backend + Rediseño UI)** &mdash; **Completada**
  * Base de datos PostgreSQL, Auth y Realtime en Supabase.
  * Portal de login B2B con identidad visual indigo.
  * Panel de administración unificado (Despacho, Flota, KDS, Menú).
  * Tienda pública y checkout con geolocalización GPS.
  * Seguimiento en vivo con Leaflet.
* **Fase 2: App Móvil del Repartidor (Flutter / Android First)** &mdash; **En Progreso**
  * Aplicación móvil nativa en `apps/mobile_driver`.
  * Bolsa de trabajo de pedidos y aceptación en ruta.
  * Transmisión GPS periódica en segundo plano.
  * Validación de entrega mediante código PIN de seguridad.
* **Fase 3: Multi-tenancy B2B y Facturación** &mdash; **Pendiente**
  * Políticas de seguridad RLS avanzadas.
  * Límites por suscripción (`STARTER`, `GROWTH`, `ENTERPRISE`).
* **Fase 4: Automatizaciones y Notificaciones** &mdash; **Pendiente**
  * Disparos automáticos vía WhatsApp con link de seguimiento.
  * Notificaciones Push para cocina y repartidores.

---

## Reglas de Código y Contribución

1. **Sin emoticonos:** No utilizar emojis en nombres de variables, mensajes de commit, logs o documentación.
2. **Comentarios concisos:** Mantener los comentarios en código breves y únicamente cuando aporten claridad técnica necesaria.
3. **Verificación de build:** Antes de enviar cambios, validar que no existan errores de compilación ejecutando:
   ```bash
   cd apps/web && npm run build
   ```
