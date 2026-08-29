CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE order_status AS ENUM (
  'RECIBIDO',
  'EN_PREPARACION',
  'LISTO',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO'
);

CREATE TYPE payment_method AS ENUM ('EFECTIVO', 'YAPE', 'PLIN');

CREATE TYPE plan_type AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');

CREATE TABLE restaurants (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(100) NOT NULL,
    slug           VARCHAR(50)  UNIQUE NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    address        TEXT         NOT NULL,
    logo_url       TEXT,
    brand_color    VARCHAR(7)   DEFAULT '#E53E3E',
    is_open        BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT now() NOT NULL
);

CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id           UUID REFERENCES restaurants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan                    plan_type    DEFAULT 'STARTER',
    max_drivers             INT          DEFAULT 2,
    max_orders_per_month    INT          DEFAULT 300,
    orders_this_month       INT          DEFAULT 0,
    billing_cycle_start     DATE         DEFAULT CURRENT_DATE,
    is_active               BOOLEAN      DEFAULT true,
    created_at              TIMESTAMPTZ  DEFAULT now() NOT NULL
);

CREATE TABLE drivers (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id  UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    name           VARCHAR(100) NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    is_active      BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT now() NOT NULL
);

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    category        VARCHAR(50)  DEFAULT 'A la Carta',
    price           DECIMAL(10, 2) NOT NULL,
    image_url       TEXT,
    is_available    BOOLEAN      DEFAULT true,
    available_days  INT[]        DEFAULT '{1,2,3,4,5,6,7}',
    sort_order      INT          DEFAULT 0,
    created_at      TIMESTAMPTZ  DEFAULT now() NOT NULL
);

CREATE TABLE orders (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id        UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    driver_id            UUID REFERENCES drivers(id) ON DELETE SET NULL,
    order_number         SERIAL,
    customer_name        VARCHAR(100) NOT NULL,
    customer_phone       VARCHAR(20)  NOT NULL,
    delivery_address     TEXT         NOT NULL,
    delivery_reference   TEXT,
    delivery_lat         DOUBLE PRECISION NOT NULL,
    delivery_lng         DOUBLE PRECISION NOT NULL,
    status               order_status DEFAULT 'RECIBIDO',
    payment_method       payment_method DEFAULT 'EFECTIVO',
    cash_amount_change   DECIMAL(10, 2),
    total_amount         DECIMAL(10, 2) NOT NULL,
    notes                TEXT,
    created_at           TIMESTAMPTZ  DEFAULT now() NOT NULL,
    delivered_at         TIMESTAMPTZ
);

CREATE TABLE order_items (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id      UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name  VARCHAR(100) NOT NULL,
    quantity      INT          NOT NULL CHECK (quantity > 0),
    unit_price    DECIMAL(10, 2) NOT NULL
);

CREATE TABLE driver_locations (
    driver_id         UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
    current_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
    current_lat       DOUBLE PRECISION NOT NULL,
    current_lng       DOUBLE PRECISION NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;

ALTER TABLE restaurants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pub_read_restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "pub_read_products"    ON products    FOR SELECT USING (true);

CREATE POLICY "admin_all_restaurants"     ON restaurants     FOR ALL USING (true);
CREATE POLICY "admin_all_products"        ON products        FOR ALL USING (true);
CREATE POLICY "admin_all_orders"          ON orders          FOR ALL USING (true);
CREATE POLICY "admin_all_order_items"     ON order_items     FOR ALL USING (true);
CREATE POLICY "admin_all_drivers"         ON drivers         FOR ALL USING (true);
CREATE POLICY "admin_all_driver_locations" ON driver_locations FOR ALL USING (true);
CREATE POLICY "admin_all_subscriptions"   ON subscriptions   FOR ALL USING (true);

CREATE POLICY "pub_read_orders_by_id" ON orders FOR SELECT USING (true);
CREATE POLICY "pub_read_order_items"  ON order_items FOR SELECT USING (true);
CREATE POLICY "pub_read_driver_locs"  ON driver_locations FOR SELECT USING (true);
CREATE POLICY "pub_insert_orders"     ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "pub_insert_order_items" ON order_items FOR INSERT WITH CHECK (true);