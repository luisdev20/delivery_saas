INSERT INTO restaurants (id, name, slug, phone, address, brand_color, is_open)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'El Rincón Criollo',
  'rincon-criollo',
  '987654321',
  'Av. La Marina 1234, San Miguel, Lima',
  '#E53E3E',
  true
);

INSERT INTO subscriptions (restaurant_id, plan, max_drivers, max_orders_per_month)
VALUES ('00000000-0000-0000-0000-000000000001', 'STARTER', 2, 300);

INSERT INTO drivers (restaurant_id, name, phone, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Carlos Rios',    '941000001', true),
  ('00000000-0000-0000-0000-000000000001', 'Miguel Torres',  '941000002', true);

INSERT INTO products (restaurant_id, name, description, category, price, is_available, available_days, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Menú del Día Completo', 'Entrada, segundo y refresco.', 'Menú del Día', 15.00, true, '{1,2,3,4,5}', 1),
  ('00000000-0000-0000-0000-000000000001', 'Caldo de Gallina', 'Caldo con fideos, papa y huevo.', 'Menú del Día', 10.00, true, '{1,2,3,4,5}', 2),
  ('00000000-0000-0000-0000-000000000001', 'Lomo Saltado', 'Lomo saltado con papas fritas y arroz.', 'A la Carta', 22.00, true, '{1,2,3,4,5,6,7}', 10),
  ('00000000-0000-0000-0000-000000000001', 'Pollo a la Brasa (1/4)', 'Cuarto de pollo con papas y ensalada.', 'A la Carta', 18.00, true, '{1,2,3,4,5,6,7}', 11),
  ('00000000-0000-0000-0000-000000000001', 'Tallarín Saltado con Pollo', 'Tallarín verde salteado con pollo.', 'A la Carta', 20.00, true, '{1,2,3,4,5,6,7}', 12),
  ('00000000-0000-0000-0000-000000000001', 'Seco de Res con Frijoles', 'Guiso de res con frijoles y arroz.', 'A la Carta', 22.00, true, '{1,2,3,4,5,6,7}', 13),
  ('00000000-0000-0000-0000-000000000001', 'Causa Limeña', 'Papa amarilla rellena de pollo.', 'A la Carta', 12.00, true, '{1,2,3,4,5,6,7}', 14),
  ('00000000-0000-0000-0000-000000000001', 'Arroz con Pato Norteño', 'Arroz verde con pato guisado. Fines de semana.', 'A la Carta', 28.00, true, '{6,7}', 20),
  ('00000000-0000-0000-0000-000000000001', 'Carapulcra con Sopa Seca', 'Papa seca con fideos. Fines de semana.', 'A la Carta', 25.00, true, '{6,7}', 21),
  ('00000000-0000-0000-0000-000000000001', 'Chicha Morada (1L)', 'Bebida natural de maíz morado.', 'Bebidas', 6.00, true, '{1,2,3,4,5,6,7}', 30),
  ('00000000-0000-0000-0000-000000000001', 'Limonada Frozen', 'Limonada helada.', 'Bebidas', 7.00, true, '{1,2,3,4,5,6,7}', 31),
  ('00000000-0000-0000-0000-000000000001', 'Inca Kola 500ml', 'Bebida gaseosa.', 'Bebidas', 4.00, true, '{1,2,3,4,5,6,7}', 32),
  ('00000000-0000-0000-0000-000000000001', 'Agua San Luis 625ml', 'Agua mineral sin gas.', 'Bebidas', 3.00, true, '{1,2,3,4,5,6,7}', 33),
  ('00000000-0000-0000-0000-000000000001', 'Arroz con Leche', 'Arroz con leche y canela.', 'Postres', 6.00, true, '{1,2,3,4,5,6,7}', 40),
  ('00000000-0000-0000-0000-000000000001', 'Mazamorra Morada', 'Mazamorra de maíz morado.', 'Postres', 6.00, true, '{1,2,3,4,5,6,7}', 41);
