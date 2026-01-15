-- Quilmes Corrugados - Schema Inicial
-- Sistema de Cotización de Cajas de Cartón Corrugado

-- =====================================================
-- TABLA: pricing_config
-- Configuración de precios (actualizable mensualmente)
-- =====================================================
CREATE TABLE pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_per_m2_standard DECIMAL(10,2) NOT NULL DEFAULT 700,
  price_per_m2_volume DECIMAL(10,2) NOT NULL DEFAULT 670,
  volume_threshold_m2 DECIMAL(10,2) NOT NULL DEFAULT 5000,
  min_m2_per_model DECIMAL(10,2) NOT NULL DEFAULT 3000,
  free_shipping_min_m2 DECIMAL(10,2) NOT NULL DEFAULT 4000,
  free_shipping_max_km INTEGER NOT NULL DEFAULT 60,
  production_days_standard INTEGER NOT NULL DEFAULT 7,
  production_days_printing INTEGER NOT NULL DEFAULT 14,
  quote_validity_days INTEGER NOT NULL DEFAULT 7,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: clients
-- Clientes
-- =====================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  cuit TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  province TEXT DEFAULT 'Buenos Aires',
  distance_km INTEGER,
  payment_terms TEXT DEFAULT 'contado' CHECK (payment_terms IN ('contado', 'cheque_30')),
  is_recurring BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: boxes
-- Catálogo de cajas estándar
-- =====================================================
CREATE TABLE boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  length_mm INTEGER NOT NULL CHECK (length_mm >= 200),
  width_mm INTEGER NOT NULL CHECK (width_mm >= 200),
  height_mm INTEGER NOT NULL CHECK (height_mm >= 100),
  unfolded_length_mm INTEGER NOT NULL,
  unfolded_width_mm INTEGER NOT NULL,
  m2_per_box DECIMAL(10,4) NOT NULL,
  is_standard BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: quotes
-- Cotizaciones
-- =====================================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted')),
  channel TEXT DEFAULT 'manual' CHECK (channel IN ('manual', 'whatsapp', 'email', 'web')),

  -- Totales calculados
  total_m2 DECIMAL(12,4) NOT NULL,
  price_per_m2 DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,

  -- Impresión
  has_printing BOOLEAN DEFAULT false,
  printing_colors INTEGER DEFAULT 0,
  printing_cost DECIMAL(12,2) DEFAULT 0,
  has_existing_polymer BOOLEAN DEFAULT false,

  -- Troquelado
  has_die_cut BOOLEAN DEFAULT false,
  die_cut_cost DECIMAL(12,2) DEFAULT 0,

  -- Envío
  shipping_cost DECIMAL(12,2) DEFAULT 0,
  shipping_notes TEXT,

  -- Total final
  total DECIMAL(12,2) NOT NULL,

  -- Tiempos
  production_days INTEGER NOT NULL,
  estimated_delivery DATE,

  -- Validez
  valid_until DATE NOT NULL,

  -- Notas
  notes TEXT,
  internal_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,

  -- Conversión
  converted_to_order_id UUID
);

-- =====================================================
-- TABLA: quote_items
-- Items de cotización
-- =====================================================
CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  box_id UUID REFERENCES boxes(id) ON DELETE SET NULL,

  -- Medidas (para custom o histórico)
  length_mm INTEGER NOT NULL,
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  unfolded_length_mm INTEGER NOT NULL,
  unfolded_width_mm INTEGER NOT NULL,

  -- Cálculos
  m2_per_box DECIMAL(10,4) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_m2 DECIMAL(12,4) NOT NULL,

  -- Flags
  is_custom BOOLEAN DEFAULT false,
  is_oversized BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: orders
-- Órdenes
-- =====================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  status TEXT DEFAULT 'pending_deposit' CHECK (status IN (
    'pending_deposit', 'confirmed', 'in_production', 'ready', 'shipped', 'delivered', 'cancelled'
  )),

  -- Montos (copiados de quote para histórico)
  total_m2 DECIMAL(12,4) NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  printing_cost DECIMAL(12,2) DEFAULT 0,
  die_cut_cost DECIMAL(12,2) DEFAULT 0,
  shipping_cost DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,

  -- Pagos
  deposit_amount DECIMAL(12,2) NOT NULL,
  deposit_status TEXT DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'paid')),
  deposit_method TEXT CHECK (deposit_method IN ('transferencia', 'cheque', 'efectivo', 'echeq')),
  deposit_paid_at TIMESTAMPTZ,

  balance_amount DECIMAL(12,2) NOT NULL,
  balance_status TEXT DEFAULT 'pending' CHECK (balance_status IN ('pending', 'paid')),
  balance_method TEXT CHECK (balance_method IN ('transferencia', 'cheque', 'efectivo', 'echeq')),
  balance_paid_at TIMESTAMPTZ,

  -- Entrega
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_notes TEXT,

  -- Fechas
  estimated_delivery DATE,
  production_started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT
);

-- =====================================================
-- TABLA: order_items
-- Items de orden (copiados de quote_items para histórico)
-- =====================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,

  length_mm INTEGER NOT NULL,
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  m2_per_box DECIMAL(10,4) NOT NULL,
  quantity INTEGER NOT NULL,
  total_m2 DECIMAL(12,4) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: communications
-- Historial de comunicaciones
-- =====================================================
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'phone', 'manual')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,
  content TEXT,

  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: printing_designs
-- Diseños de impresión
-- =====================================================
CREATE TABLE printing_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,

  name TEXT,
  file_url TEXT,
  file_type TEXT,
  colors INTEGER,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- TABLA: quote_sequence y order_sequence
-- Secuencias para numeración
-- =====================================================
CREATE TABLE quote_sequence (
  year INTEGER PRIMARY KEY,
  last_number INTEGER DEFAULT 0
);

CREATE TABLE order_sequence (
  year INTEGER PRIMARY KEY,
  last_number INTEGER DEFAULT 0
);

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para generar número de cotización
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  next_number INTEGER;
BEGIN
  INSERT INTO quote_sequence (year, last_number)
  VALUES (current_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = quote_sequence.last_number + 1
  RETURNING last_number INTO next_number;

  RETURN 'QC-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Función para generar número de orden
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  next_number INTEGER;
BEGIN
  INSERT INTO order_sequence (year, last_number)
  VALUES (current_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = order_sequence.last_number + 1
  RETURNING last_number INTO next_number;

  RETURN 'OC-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX idx_clients_company ON clients(company);
CREATE INDEX idx_clients_cuit ON clients(cuit);
CREATE INDEX idx_quotes_client_id ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at);
CREATE INDEX idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_quote_id ON orders(quote_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_communications_client_id ON communications(client_id);
CREATE INDEX idx_communications_quote_id ON communications(quote_id);
CREATE INDEX idx_communications_order_id ON communications(order_id);
