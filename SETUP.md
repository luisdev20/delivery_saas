# GUÍA DE INICIALIZACIÓN: DELIVERY PLATFORM (SUPABASE + NEXT.JS + FLUTTER)

## 1. Estructura del Monorepo

```text
delivery-platform/
├── apps/
│   ├── web/               # Next.js 14+ (Panel Admin, Menú WhatsApp, Tracking Cliente)
│   └── driver_app/        # Flutter (App de Repartidor con GPS en background)
├── supabase/              # Configuración local / migrations de Supabase
│   ├── migrations/
│   └── config.toml
├── .env.example
├── BUSINESS_MODEL.md
├── SETUP.md
└── README.md

```

---

## 2. Esquema SQL para Supabase (Database + Realtime + RLS)

Ejecuta este script en el **SQL Editor** de tu panel de Supabase:

```sql
-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Restaurantes (Tenants)
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Repartidores (Drivers)
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Menú de Productos (Criollo) con Gestión de Disponibilidad y Días
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'A la Carta', -- 'Menú del Día', 'A la Carta', 'Bebidas'
    price DECIMAL(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT true,          -- Switch de disponibilidad inmediata ("Se Agotó")
    available_days INT[] DEFAULT '{1,2,3,4,5,6,7}', -- 1: Lunes, 7: Domingo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tipos y Tabla de Órdenes (Solo Efectivo y Billeteras Digitales)
CREATE TYPE order_status AS ENUM ('RECIBIDO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO');
CREATE TYPE payment_method AS ENUM ('EFECTIVO', 'YAPE', 'PLIN');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    order_number SERIAL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_reference TEXT,
    delivery_lat DOUBLE PRECISION NOT NULL,
    delivery_lng DOUBLE PRECISION NOT NULL,
    status order_status DEFAULT 'RECIBIDO',
    payment_method payment_method DEFAULT 'EFECTIVO',
    cash_amount_change DECIMAL(10, 2), -- Monto con el que paga si requiere vuelto en efectivo
    total_amount DECIMAL(10, 2) NOT NULL, -- Total en Soles (PEN)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- 6. Detalle de la Orden
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- 7. Coordenadas en Vivo del Repartidor
CREATE TABLE driver_locations (
    driver_id UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    current_lat DOUBLE PRECISION NOT NULL,
    current_lng DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Habilitar Supabase Realtime en las tablas clave
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE products;

-- 9. Políticas de Seguridad (RLS) - Permisivo para prototipado
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de restaurantes" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Lectura pública de productos" ON products FOR SELECT USING (true);
CREATE POLICY "Acceso total a productos para admin" ON products FOR ALL USING (true);
CREATE POLICY "Acceso total a órdenes" ON orders FOR ALL USING (true);
CREATE POLICY "Acceso total a order_items" ON order_items FOR ALL USING (true);
CREATE POLICY "Acceso total a drivers" ON drivers FOR ALL USING (true);
CREATE POLICY "Acceso total a driver_locations" ON driver_locations FOR ALL USING (true);

```

---

## 3. Comandos de Inicialización en Terminal

### Paso 1: Crear las aplicaciones del Monorepo

```bash
# 1. Crear directorio base
mkdir delivery-platform && cd delivery-platform
mkdir -p apps

# 2. Crear Frontend Web (Next.js con Tailwind y App Router)
npx create-next-app@latest apps/web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 3. Crear App Repartidor (Flutter)
flutter create --org com.delivery.driver apps/driver_app

```

---

### Paso 2: Configurar Dependencias en `apps/web`

```bash
cd apps/web
npm install @supabase/supabase-js @supabase/ssr leaflet lucide-react clsx tailwind-merge
npm install -D @types/leaflet

```

Crea el archivo `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui

```

Crea el cliente en `apps/web/src/lib/supabaseClient.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

```

---

### Paso 3: Configurar Dependencias en `apps/driver_app`

```bash
cd ../driver_app
flutter pub add supabase_flutter geolocator url_launcher flutter_background_service

```

Inicializa Supabase en `apps/driver_app/lib/main.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: 'https://tu-proyecto.supabase.co',
    anonKey: 'tu-anon-key-aqui',
  );

  runApp(const MaterialApp(
    home: Scaffold(
      body: Center(child: Text('Driver App Lista')),
    ),
  ));
}

```

---

## 4. Rutas Principales a Construir en `apps/web`

1. **`src/app/p/[slug]/page.tsx`**: Vista cliente para armar pedidos criollos en Soles (PEN) filtrados por disponibilidad del día, seleccionar método de pago directo (Yape, Plin, Efectivo) y enviar ubicación GPS.
2. **`src/app/admin/page.tsx`**: Panel de recepción de pedidos con alertas sonoras en vivo, mapa general de flota y asignación de motorizados.
3. **`src/app/admin/menu/page.tsx`**: Panel de gestión rápida para alternar el switch de disponibilidad de platos (`is_available`) y programar platos por día de la semana.
4. **`src/app/tracking/[orderId]/page.tsx`**: Mapa en vivo (Leaflet) que suscribe los cambios de posición en `driver_locations`.