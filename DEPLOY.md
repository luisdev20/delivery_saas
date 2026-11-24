# Despliegue de DeliveryOS

Documento operativo para publicar el panel, las API, las tiendas B2B y la
aplicación móvil de motorizados sobre infraestructura gratuita.

## 1. Arquitectura de destino

```
                        ┌──────────────────────────────┐
   Navegador  ───────►  │ Vercel (Hobby)               │
                        │ apps/web · Next.js 16        │
                        │ panel, consola y /api/*      │
                        └──────────────┬───────────────┘
                                       │ service_role / anon
                                       ▼
                        ┌──────────────────────────────┐
                        │ Supabase (Free)              │
                        │ Postgres, Auth, Realtime     │
                        └──────────────▲───────────────┘
                                       │
   Tiendas B2B  ──────────────────────┘
   (Render Free · apps/store_*)

   App motorizados (Flutter) ── APK firmado vía GitHub Actions ── Releases
```

No existe un backend separado: Supabase es la capa de datos y
autenticación, y las rutas `/api/*` de Next.js son la capa de aplicación
(validación de suscripción, cuotas, cobranza y retención). Por eso Vercel
aloja front y API en un solo despliegue y Render se reserva para los
clientes de e-commerce de demostración.

## 2. Decisiones de plataforma

| Componente | Plataforma | Plan | Motivo |
|---|---|---|---|
| Panel y API | Vercel | Hobby | Build nativo de Next.js, cron diario incluido y funciones serverless sin configuración extra |
| Base de datos, Auth, Realtime | Supabase | Free | Ya es la dependencia del proyecto; incluye RLS, funciones SQL y almacenamiento |
| Tiendas B2B | Render | Free | Servicios Node persistentes con proxy server-side de la API key |
| APK de motorizados | GitHub Actions + Releases | Free | Compilación reproducible y distribución por enlace directo |
| Correo de avisos | Resend o Brevo | Free | Resend si se define `RESEND_API_KEY`; en su defecto reutiliza `BREVO_API_KEY` y `SENDER_EMAIL` de `private_app_config` |

Límites relevantes de los planes gratuitos: Vercel Hobby admite una
ejecución diaria por cron y tráfico de portafolio; Supabase Free pausa
proyectos inactivos y limita el almacenamiento; Render Free suspende el
servicio tras 15 minutos sin tráfico, con arranque en frío de ~30 s. Para
producción comercial, el primer punto de ampliación es Supabase Pro,
seguido de Vercel Pro para crons con mayor frecuencia.

## 3. Supabase

1. Crear o reutilizar el proyecto y anotar `Project URL`, `anon key` y
   `service_role key`.
2. Aplicar en el SQL Editor, en orden, las migraciones de
   `supabase/migrations/` (`001` a `013`). Cada archivo es idempotente y
   puede reejecutarse sin duplicar datos.
3. La migración `013_tenant_retention.sql` incorpora el estado de
   retención (`retention_hold`, `retention_extended_until`) y la tabla de
   auditoría `tenant_retention_events`. Es la única dependencia nueva del
   módulo de gobierno de datos.
4. Verificar que el usuario de plataforma tenga `role = 'superadmin'` en
   `tenant_users`; la consola `/superadmin` exige ese rol y redirige en
   caso contrario.

## 4. Vercel

1. Importar el repositorio y definir **Root Directory** en `apps/web`.
2. Framework: Next.js. Build: `npm run build`. Install: `npm install`.
3. Configurar variables de entorno de producción y preview:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_NAME
CRON_SECRET
RESEND_API_KEY            # opcional
RETENTION_EMAIL_FROM      # opcional
```

`SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` son secretos de servidor: no
deben llevar el prefijo `NEXT_PUBLIC_`.

4. El archivo `apps/web/vercel.json` declara el cron diario
   `/api/cron/retention` a las 11:00 UTC (06:00 en Lima). Vercel agrega
   automáticamente `Authorization: Bearer $CRON_SECRET` cuando la variable
   existe en el proyecto.
5. Asociar el dominio definitivo en **Settings → Domains** y actualizar
   `SAAS_URL` en las tiendas.

## 5. Render (tiendas B2B)

1. Crear un Blueprint apuntando a `render.yaml` de la raíz del repositorio.
2. Completar por servicio:
   - `SAAS_URL`: dominio de Vercel.
   - `DELIVERY_API_KEY`: clave generada desde **Panel del comercio →
     Integraciones**. La clave permanece solo en el servidor de la tienda.
3. Los servidores leen `process.env.PORT`, por lo que funcionan sin
   cambios sobre el puerto asignado por Render.

## 6. Aplicación móvil

Compilación local:

```bash
cd apps/mobile_driver
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://tu-proyecto.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=tu-publishable-key
```

El APK queda en `build/app/outputs/flutter-apk/app-release.apk`.

Distribución por etiqueta: el flujo `.github/workflows/android-release.yml`
compila el APK y lo adjunta al release al publicar una etiqueta `v*`.

```bash
git tag v1.0.0
git push origin v1.0.0
```

Requiere los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY` en el
repositorio. Para firma de producción, agregar el keystore como secreto
en base64 y un `android/key.properties` generado en el paso de compilación;
sin ese paso, Flutter firma con la clave de depuración, válida para
instalación directa pero no para Google Play.

## 7. Retención y eliminación de cuentas

Política vigente, definida en `apps/web/src/lib/retention.ts`:

| Etapa | Plazo | Efecto |
|---|---|---|
| Servicio | Ciclo pagado o trial de 14 días | Operación completa |
| Gracia | 30 días tras el vencimiento | Panel en solo lectura, datos conservados |
| Aviso | Últimos 7 días de la gracia | Notificación al propietario y banner persistente |
| Último aviso | Últimos 2 días | Aviso crítico en el panel |
| Purga | Cumplido el plazo | Eliminación del comercio, dependencias y cuentas de acceso |

El trabajo `GET|POST /api/cron/retention`:

- exige `Authorization: Bearer $CRON_SECRET`;
- registra cada aviso en `tenant_retention_events` y evita duplicados
  dentro del mismo día;
- envía correo con Resend cuando `RESEND_API_KEY` y `RETENTION_EMAIL_FROM`
  están configurados; en su defecto usa la cuenta Brevo registrada en
  `private_app_config` (`BREVO_API_KEY` y `SENDER_EMAIL`), por lo que el
  aviso funciona sin variables adicionales;
- elimina los comercios vencidos con `service_role`, en cascada, y da de
  baja las cuentas de acceso que quedan sin membresía;
- omite comercios con `retention_hold` y comercios que alojan una cuenta
  `superadmin`.

Ejecución manual del ciclo en modo simulación:

```bash
curl -X POST "https://tu-dominio/api/cron/retention?dryRun=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

La consola `/superadmin` permite prorrogar 30 días, resguardar una cuenta,
liberarla o ejecutar la purga anticipada con confirmación por slug.

## 8. Orden de publicación

1. Aplicar migraciones en Supabase.
2. Desplegar Next.js en Vercel con las variables de servidor.
3. Confirmar que el cron queda registrado en **Vercel → Cron Jobs**.
4. Desplegar las tiendas en Render y enlazar `SAAS_URL`.
5. Compilar el APK y publicar la etiqueta de versión.
6. Rotar `CRON_SECRET` y las claves de API antes de abrir el acceso a
   comercios externos.

## 9. Operación posterior

- **Cobranza:** la pestaña Pagos de `/superadmin` registra cobros manuales
  (Yape o tarjeta) y renueva el ciclo con comprobante en
  `billing_transactions`.
- **Cartera:** la pestaña Empresas concentra plan, consumo del ciclo,
  estado del servicio y situación de retención por comercio.
- **Auditoría:** las purgas quedan registradas en
  `tenant_retention_events` y se listan en la pestaña Retención.
- **Costos:** el consumo de Supabase (base de datos y almacenamiento) es
  el primer indicador a vigilar; Render solo afecta la disponibilidad de
  las tiendas de demostración.
