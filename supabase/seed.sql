-- Quilmes Corrugados - Seed Data
-- Datos iniciales para el sistema

-- =====================================================
-- Configuración inicial de precios
-- =====================================================
INSERT INTO pricing_config (
  price_per_m2_standard,
  price_per_m2_volume,
  volume_threshold_m2,
  min_m2_per_model,
  free_shipping_min_m2,
  free_shipping_max_km,
  production_days_standard,
  production_days_printing,
  quote_validity_days,
  valid_from,
  is_active
) VALUES (
  700, 670, 5000, 3000, 4000, 60, 7, 14, 7, CURRENT_DATE, true
);

-- =====================================================
-- Catálogo de cajas estándar RSC (Regular Slotted Container)
-- Cajas con aletas simples - Fórmulas de plancha:
-- Ancho plancha = H + A (Alto + Ancho)
-- Largo plancha = 2L + 2A + 50 (2 Largos + 2 Anchos + chapetón/refile)
-- m² = (Ancho × Largo) / 1.000.000
-- =====================================================

-- Caja 200x200x100
-- Ancho: 100 + 200 = 300mm
-- Largo: 2(200) + 2(200) + 50 = 850mm
-- m²: 0.300 × 0.850 = 0.2550
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 20x20x10', 200, 200, 100, 300, 850, 0.2550, true);

-- Caja 200x200x200
-- Ancho: 200 + 200 = 400mm
-- Largo: 2(200) + 2(200) + 50 = 850mm
-- m²: 0.400 × 0.850 = 0.3400
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 20x20x20', 200, 200, 200, 400, 850, 0.3400, true);

-- Caja 300x200x150
-- Ancho: 150 + 200 = 350mm
-- Largo: 2(300) + 2(200) + 50 = 1050mm
-- m²: 0.350 × 1.050 = 0.3675
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 30x20x15', 300, 200, 150, 350, 1050, 0.3675, true);

-- Caja 300x200x200
-- Ancho: 200 + 200 = 400mm
-- Largo: 2(300) + 2(200) + 50 = 1050mm
-- m²: 0.400 × 1.050 = 0.4200
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 30x20x20', 300, 200, 200, 400, 1050, 0.4200, true);

-- Caja 400x300x300
-- Ancho: 300 + 300 = 600mm
-- Largo: 2(400) + 2(300) + 50 = 1450mm
-- m²: 0.600 × 1.450 = 0.8700
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 40x30x30', 400, 300, 300, 600, 1450, 0.8700, true);

-- Caja 500x400x300
-- Ancho: 300 + 400 = 700mm
-- Largo: 2(500) + 2(400) + 50 = 1850mm
-- m²: 0.700 × 1.850 = 1.2950
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 50x40x30', 500, 400, 300, 700, 1850, 1.2950, true);

-- Caja 500x400x400
-- Ancho: 400 + 400 = 800mm
-- Largo: 2(500) + 2(400) + 50 = 1850mm
-- m²: 0.800 × 1.850 = 1.4800
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 50x40x40', 500, 400, 400, 800, 1850, 1.4800, true);

-- Caja 600x400x300
-- Ancho: 300 + 400 = 700mm
-- Largo: 2(600) + 2(400) + 50 = 2050mm
-- m²: 0.700 × 2.050 = 1.4350
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 60x40x30', 600, 400, 300, 700, 2050, 1.4350, true);

-- Caja 600x400x400
-- Ancho: 400 + 400 = 800mm
-- Largo: 2(600) + 2(400) + 50 = 2050mm
-- m²: 0.800 × 2.050 = 1.6400
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 60x40x40', 600, 400, 400, 800, 2050, 1.6400, true);

-- Caja 700x500x500 (sobredimensionada - requiere cotización especial)
-- Ancho: 500 + 500 = 1000mm
-- Largo: 2(700) + 2(500) + 50 = 2450mm
-- m²: 1.000 × 2.450 = 2.4500
INSERT INTO boxes (name, length_mm, width_mm, height_mm, unfolded_width_mm, unfolded_length_mm, m2_per_box, is_standard)
VALUES ('Caja 70x50x50', 700, 500, 500, 1000, 2450, 2.4500, true);

-- =====================================================
-- Clientes de ejemplo
-- =====================================================
INSERT INTO clients (name, company, cuit, email, phone, whatsapp, address, city, province, distance_km, payment_terms, is_recurring)
VALUES
  ('Juan Pérez', 'Distribuidora Norte SRL', '30-12345678-9', 'juan@distribuidoranorte.com.ar', '011-4444-5555', '5491144445555', 'Av. Mitre 1234', 'San Fernando', 'Buenos Aires', 25, 'contado', true),
  ('María González', 'Logística Sur SA', '30-98765432-1', 'maria@logisticasur.com.ar', '011-5555-6666', '5491155556666', 'Calle Belgrano 567', 'Quilmes', 'Buenos Aires', 5, 'cheque_30', true),
  ('Carlos Rodríguez', 'Mudanzas Express', '20-11223344-5', 'carlos@mudanzasexpress.com.ar', '011-6666-7777', '5491166667777', 'Ruta 2 km 45', 'La Plata', 'Buenos Aires', 55, 'contado', false),
  ('Ana Martínez', 'Empaque Total', '27-44556677-8', 'ana@empaquetotal.com.ar', '011-7777-8888', '5491177778888', 'Parque Industrial Lote 12', 'Pilar', 'Buenos Aires', 45, 'contado', false),
  ('Roberto Sánchez', 'Frutas del Valle', '30-55667788-0', 'roberto@frutasdelvalle.com.ar', '011-8888-9999', '5491188889999', 'Mercado Central Local 200', 'Tapiales', 'Buenos Aires', 20, 'cheque_30', true);

-- =====================================================
-- Cotizaciones de ejemplo
-- =====================================================
INSERT INTO quotes (
  quote_number, client_id, status, channel,
  total_m2, price_per_m2, subtotal,
  has_printing, printing_colors, printing_cost, has_existing_polymer,
  has_die_cut, die_cut_cost,
  shipping_cost, shipping_notes,
  total, production_days, estimated_delivery, valid_until,
  notes, created_at
)
SELECT
  'QC-2026-0001',
  (SELECT id FROM clients WHERE company = 'Distribuidora Norte SRL'),
  'sent',
  'manual',
  2175.0000, -- 2500 cajas × 0.8700 m²
  700.00,
  1522500.00,
  false, 0, 0, false,
  false, 0,
  0, 'Envío incluido por superar 4000 m² y estar dentro de 60km',
  1522500.00,
  7,
  CURRENT_DATE + INTERVAL '10 days',
  CURRENT_DATE + INTERVAL '7 days',
  'Pedido para temporada alta',
  CURRENT_DATE - INTERVAL '2 days';

-- Actualizar secuencia
INSERT INTO quote_sequence (year, last_number) VALUES (2026, 1)
ON CONFLICT (year) DO UPDATE SET last_number = 1;

INSERT INTO quotes (
  quote_number, client_id, status, channel,
  total_m2, price_per_m2, subtotal,
  has_printing, printing_colors, printing_cost, has_existing_polymer,
  has_die_cut, die_cut_cost,
  shipping_cost, shipping_notes,
  total, production_days, estimated_delivery, valid_until,
  notes, created_at
)
SELECT
  'QC-2026-0002',
  (SELECT id FROM clients WHERE company = 'Logística Sur SA'),
  'approved',
  'whatsapp',
  3885.0000, -- 3000 cajas × 1.2950 m²
  700.00,
  2719500.00,
  true, 2, 15000, false,
  false, 0,
  0, 'Envío gratis',
  2734500.00,
  14,
  CURRENT_DATE + INTERVAL '18 days',
  CURRENT_DATE + INTERVAL '5 days',
  'Con impresión a 2 colores - logo empresa',
  CURRENT_DATE - INTERVAL '3 days';

UPDATE quote_sequence SET last_number = 2 WHERE year = 2026;

-- =====================================================
-- Items de cotización
-- Valores calculados con fórmula RSC:
-- Ancho plancha = H + A, Largo plancha = 2L + 2A + 50
-- =====================================================
INSERT INTO quote_items (
  quote_id, box_id,
  length_mm, width_mm, height_mm,
  unfolded_length_mm, unfolded_width_mm,
  m2_per_box, quantity, total_m2,
  is_custom, is_oversized
)
SELECT
  q.id,
  b.id,
  400, 300, 300,
  1450, 600,  -- Largo: 2(400)+2(300)+50=1450, Ancho: 300+300=600
  0.8700, 2500, 2175.0000,
  false, false
FROM quotes q, boxes b
WHERE q.quote_number = 'QC-2026-0001'
AND b.name = 'Caja 40x30x30';

INSERT INTO quote_items (
  quote_id, box_id,
  length_mm, width_mm, height_mm,
  unfolded_length_mm, unfolded_width_mm,
  m2_per_box, quantity, total_m2,
  is_custom, is_oversized
)
SELECT
  q.id,
  b.id,
  500, 400, 300,
  1850, 700,  -- Largo: 2(500)+2(400)+50=1850, Ancho: 300+400=700
  1.2950, 3000, 3885.0000,
  false, false
FROM quotes q, boxes b
WHERE q.quote_number = 'QC-2026-0002'
AND b.name = 'Caja 50x40x30';

-- =====================================================
-- Orden de ejemplo (convertida de cotización aprobada)
-- =====================================================
INSERT INTO orders (
  order_number, quote_id, client_id,
  status,
  total_m2, subtotal, printing_cost, die_cut_cost, shipping_cost, total,
  deposit_amount, deposit_status, deposit_method, deposit_paid_at,
  balance_amount, balance_status,
  delivery_address, delivery_city,
  estimated_delivery, production_started_at,
  created_at, confirmed_at
)
SELECT
  'OC-2026-0001',
  q.id,
  q.client_id,
  'in_production',
  q.total_m2, q.subtotal, q.printing_cost, q.die_cut_cost, q.shipping_cost, q.total,
  q.total / 2, 'paid', 'transferencia', CURRENT_DATE - INTERVAL '1 day',
  q.total / 2, 'pending',
  c.address, c.city,
  q.estimated_delivery, CURRENT_DATE,
  CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE - INTERVAL '1 day'
FROM quotes q
JOIN clients c ON q.client_id = c.id
WHERE q.quote_number = 'QC-2026-0002';

-- Actualizar cotización como convertida
UPDATE quotes
SET status = 'converted',
    converted_to_order_id = (SELECT id FROM orders WHERE order_number = 'OC-2026-0001')
WHERE quote_number = 'QC-2026-0002';

-- Actualizar secuencia de órdenes
INSERT INTO order_sequence (year, last_number) VALUES (2026, 1)
ON CONFLICT (year) DO UPDATE SET last_number = 1;

-- =====================================================
-- Items de orden
-- =====================================================
INSERT INTO order_items (
  order_id,
  length_mm, width_mm, height_mm,
  m2_per_box, quantity, total_m2
)
SELECT
  o.id,
  qi.length_mm, qi.width_mm, qi.height_mm,
  qi.m2_per_box, qi.quantity, qi.total_m2
FROM orders o
JOIN quotes q ON o.quote_id = q.id
JOIN quote_items qi ON qi.quote_id = q.id
WHERE o.order_number = 'OC-2026-0001';

-- =====================================================
-- Comunicaciones de ejemplo
-- =====================================================
INSERT INTO communications (client_id, quote_id, channel, direction, subject, content, created_at)
SELECT
  q.client_id, q.id, 'manual', 'outbound',
  'Cotización enviada', 'Se envió cotización QC-2026-0001 por email',
  CURRENT_DATE - INTERVAL '2 days'
FROM quotes q WHERE q.quote_number = 'QC-2026-0001';

INSERT INTO communications (client_id, quote_id, channel, direction, subject, content, created_at)
SELECT
  q.client_id, q.id, 'whatsapp', 'inbound',
  'Consulta de cotización', 'Cliente consulta disponibilidad de impresión',
  CURRENT_DATE - INTERVAL '4 days'
FROM quotes q WHERE q.quote_number = 'QC-2026-0002';

INSERT INTO communications (client_id, quote_id, channel, direction, subject, content, created_at)
SELECT
  q.client_id, q.id, 'whatsapp', 'outbound',
  'Cotización enviada', 'Se envió cotización actualizada con impresión',
  CURRENT_DATE - INTERVAL '3 days'
FROM quotes q WHERE q.quote_number = 'QC-2026-0002';
