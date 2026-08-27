# DOCUMENTO DE DEFINICIÓN DE NEGOCIO: DELIVERY-AS-A-SERVICE (B2B)

## 1. Resumen Ejecutivo

Plataforma B2B bajo el modelo **SaaS (Software as a Service)** diseñada para proporcionar infraestructura tecnológica de despacho y seguimiento de última milla a restaurantes con flota de reparto propia. El sistema permite operar pedidos directos (WhatsApp y llamadas) con tracking GPS en tiempo real sin incurrir en las comisiones de terceros (20%–30%) y sin exigir al consumidor final la instalación de aplicaciones móviles. Todas las tarifas y operaciones monetarias se gestionan en moneda local (**Soles - PEN**).

---

## 2. Propuesta de Valor y Diferenciación

### 2.1 Propuesta de Valor

* **Para el Restaurante:** Control total de la logística de despacho, visibilidad en tiempo real de motorizados y propiedad absoluta de la base de datos de clientes recurrentes bajo una tarifa fija predecible.
* **Para el Cliente Final:** Experiencia de seguimiento interactiva en vivo ("Zero-Download") mediante un enlace web ligero compartido automáticamente por WhatsApp.

### 2.2 Diferenciación frente a Agregadores Tradicionales (Rappi, PedidosYa)

* **Cero Comisiones por Venta:** Cobro por suscripción fija por flota, reteniendo el 100% del margen por plato.
* **Canal Directo Optimizado:** Convierte la interacción informal de WhatsApp en órdenes estructuradas mediante un menú web ligero de 30 segundos.
* **Marca Propia:** Vistas de seguimiento personalizables con la identidad visual del restaurante criollo.

---

## 3. Modelo de Monetización B2B (Tiered SaaS en Soles)

Estructura de cobro mensual fija escalonada según la cantidad de repartidores activos registrados por el restaurante:

| Plan | Flota Permitida | Límite de Envíos / Mes | Tarifa Mensual | Funcionalidades Incluidas |
| --- | --- | --- | --- | --- |
| **Starter** | Hasta 2 motorizados | Hasta 300 pedidos | **S/ 99 / mes** | Panel de despacho web, App de repartidor (Flutter), control de menú/stock diario y tracking web en vivo. |
| **Growth (Recomendado)** | Hasta 6 motorizados | Hasta 1,200 pedidos | **S/ 199 / mes** | Todo lo de Starter + API REST B2B para integración externa + Personalización de marca. |
| **Enterprise** | Flota ilimitada | Pedidos ilimitados | **S/ 399 / mes** | Todo lo de Growth + Webhooks avanzados + Soporte técnico prioritario. |

* **Pago Único Inicial (Setup / Onboarding):** **S/ 199** (pago de instalación que incluye configuración de zonas de reparto, carga inicial de la carta y capacitación del personal).
* **Cobro por Exceso:** **S/ 0.35** por cada pedido adicional fuera del límite del plan contratado.

---

## 4. Gestión Operativa de Menú y Disponibilidad de Platos

El restaurante gestiona la rotación de su cocina criolla y la disponibilidad de stock diario de forma liviana mediante dos mecanismos en su panel administrativo:

1. **Switch de Disponibilidad Inmediata ("Se Agotó"):**
* Control toggle (`is_available: true/false`) por plato. Si un plato como *Seco de Res* se agota durante el servicio, el operador lo desactiva con un clic y desaparece en tiempo real del menú web del cliente.


2. **Programación por Días de la Semana:**
* Configuración de días activos (`available_days: [1,2,...]`), permitiendo definir menús ejecutivos para días laborales o platos especiales exclusivamente para fines de semana (ej. *Arroz con Pato* sábados y domingos).



---

## 5. Flujo Operativo del Negocio (Ciclo del Pedido)

```
1. Captación (WhatsApp):
   El cliente escribe -> Recibe respuesta con link ligero: /p/[slug-restaurante]

2. Creación de la Orden (Web Cliente):
   • Selecciona platos disponibles según el día.
   • Comparte ubicación GPS o ingresa dirección con referencia.
   • Selecciona método de pago directo: Yape, Plin o Efectivo (especificando monto para vuelto).
   • Confirma el pedido.

3. Recepción y Cocina (Panel Admin Restaurante):
   Notificación sonora instantánea -> El restaurante valida el pago/pedido y pasa a EN_PREPARACION.

4. Asignación y Salida (Logística):
   El despachador asigna un motorizado -> Estado pasa a EN_CAMINO ->
   Se envía link de tracking /tracking/[orderId] al WhatsApp del cliente.

5. Ruta y Telemetría (App Driver Flutter):
   El repartidor activa la ruta -> La app transmite coordenadas GPS en segundo plano.

6. Entrega y Cierre:
   El repartidor cobra (Yape/Plin o Efectivo) y presiona "Confirmar Entrega" ->
   Estado pasa a ENTREGADO -> Se liberan las coordenadas y se actualizan las métricas del día.

```

---

## 6. Módulos y Roles del Sistema

* **Restaurante (Administrador / Despacho):**
* Panel web en Next.js con sincronización en tiempo real vía Supabase.
* Gestión rápida del menú criollo (activar/desactivar platos por stock diario), asignación de motorizados y mapa de flota en vivo.


* **Repartidor (Driver):**
* App móvil en Flutter con servicio en segundo plano (*Foreground Service*).
* Recepción de entregas, navegación asistida hacia Waze/Google Maps y confirmación de cobro (Efectivo/Billeteras digitales).


* **Consumidor Final (Cliente):**
* Vista web pública responsive sin registro ni contraseñas.
* Menú filtrado por disponibilidad del día, selección de pago sin pasarelas bancarias externas y mapa interactivo de seguimiento.


* **Sistemas Externos (Integración B2B):**
* API REST para registrar despachos directamente desde sistemas de software externos.



---

## 7. Métricas Clave de Éxito (KPIs)

* **Tiempo promedio de despacho:** Minutos transcurridos desde la confirmación del pedido hasta la entrega en puerta.
* **Efectividad de ruta:** Distancia recorrida vs. tiempo de traslado por cada repartidor.
* **Ahorro operativo directo:** Comparativa del costo mensual de suscripción fija frente a la comisión del 20%–30% de un agregador tradicional.