# Delivery Tracker SaaS

Plataforma B2B para restaurantes y negocios gastronómicos que permite gestionar pedidos, monitorear la cocina en tiempo real (KDS), administrar la flota de repartidores y ofrecer seguimiento GPS en vivo a los clientes finales.

---

## Guía Rápida de Inicio para el Equipo

Sigue estos 3 pasos para levantar el proyecto en tu máquina local conectado a la base de datos compartida de desarrollo:

### 1. Clonar el repositorio e instalar dependencias

Abre tu terminal y ejecuta:

```bash
git clone https://github.com/luisdev20/delivery_saas.git
cd delivery_saas
npm install
```

---

### 2. Configurar Variables de Entorno

El proyecto ya cuenta con una base de datos centralizada en Supabase con todas las tablas, usuarios y productos de prueba configurados.

1. **Solicita el archivo `.env.local` al líder del proyecto.**
2. Crea el archivo en la ruta `apps/web/.env.local` y pega las credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
```

*(Nota: el archivo `.env.local` está protegido en `.gitignore` para no exponer claves en el repositorio).*

---

### 3. Ejecutar el Proyecto

Inicia el servidor de desarrollo:

```bash
npm run dev
```

La aplicación estará corriendo en **`http://localhost:3000`**.

---

## Rutas Principales de Prueba

| Ruta | Descripción | Acceso |
|---|---|:---:|
| **`/login`** | Portal de acceso para administradores del restaurante. | Público (solicitar credenciales al líder) |
| **`/admin`** | Panel de control unificado: Despachos, Gestión de Flota, Cocina KDS y Menú. | Protegido (requiere login) |
| **`/p/el-rincon-criollo`** | Tienda pública del restaurante de prueba para armar pedidos y checkout. | Público |
| **`/tracking/[orderId]`** | Pantalla de seguimiento en vivo con mapa interactivo y estados en tiempo real. | Público |

---

## Estructura del Monorepo

```text
delivery_SaaS/
├── apps/
│   ├── web/                     # Aplicación web Next.js (Admin, Storefront, Tracking)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── admin/       # Panel de administración (Despacho, Flota, KDS, Menú)
│   │   │   │   ├── login/       # Portal de acceso
│   │   │   │   ├── p/[slug]/    # Menú público y checkout
│   │   │   │   └── tracking/    # Pantalla de rastreo en vivo
│   │   │   └── lib/supabase/    # Clientes y tipos de base de datos
│   │   └── package.json
│   └── mobile_driver/           # App móvil Flutter para repartidores (Fase 2)
├── supabase/
│   └── migrations/              # Scripts SQL del esquema de base de datos
├── ideas_de_prototipos/         # Prototipos interactivos de referencia UI/UX
├── package.json
└── README.md
```

---

## Flujo Operativo del Sistema

```text
1. [Cliente] Realiza pedido en /p/[slug] con dirección o GPS y método de pago
   │
   ▼
2. [Supabase Realtime] Registra orden en estado "RECIBIDO"
   │
   ├──► [KDS / Cocina] Visualiza la orden -> Pasa a "EN_PREPARACION" -> Pasa a "LISTO"
   │
   ├──► [Admin / Despacho] Asigna repartidor desde /admin
   │
   └──► [Repartidor / App Móvil] Inicia viaje ("EN_CAMINO") transmitiendo coordenadas GPS
           │
           ▼
3. [Cliente / Tracking] Visualiza al repartidor en movimiento en /tracking/[orderId]
   │
   ▼
4. [Entrega] Repartidor valida entrega ("ENTREGADO")
```

---

## Reglas de Desarrollo y Contribución

1. **Sin emoticonos:** No utilizar emojis en nombres de variables, mensajes de commit, logs o documentación.
2. **Comentarios concisos:** Mantener comentarios breves y únicamente cuando aporten valor técnico.
3. **Verificación de build:** Antes de hacer commit o push, verifica que compile sin errores:
   ```bash
   cd apps/web && npm run build
   ```
