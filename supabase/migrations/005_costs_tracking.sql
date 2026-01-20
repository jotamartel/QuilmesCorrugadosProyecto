-- =====================================================
-- Migración 005: Sistema de Control de Costos
-- Tablas para tracking de costos fijos, variables e insumos
-- =====================================================

-- Tabla de categorías de costos
CREATE TABLE IF NOT EXISTS cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('fixed', 'variable', 'supply', 'labor', 'other')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de costos fijos mensuales
CREATE TABLE IF NOT EXISTS fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES cost_categories(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  amount DECIMAL(12, 2) NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  start_date DATE NOT NULL,
  end_date DATE, -- NULL = vigente indefinidamente
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de insumos/materiales
CREATE TABLE IF NOT EXISTS supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES cost_categories(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  unit VARCHAR(50) NOT NULL, -- kg, m2, litro, unidad, etc.
  current_price DECIMAL(12, 4) NOT NULL,
  last_price DECIMAL(12, 4),
  price_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  supplier VARCHAR(200),
  min_stock DECIMAL(10, 2) DEFAULT 0,
  current_stock DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historial de precios de insumos
CREATE TABLE IF NOT EXISTS supply_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id UUID NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
  price DECIMAL(12, 4) NOT NULL,
  effective_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de costos variables por orden
CREATE TABLE IF NOT EXISTS order_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  category_id UUID REFERENCES cost_categories(id),
  concept VARCHAR(200) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  quantity DECIMAL(10, 4) DEFAULT 1,
  unit_cost DECIMAL(12, 4),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de costos de producción estimados por m2
CREATE TABLE IF NOT EXISTS production_cost_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  -- Costos de materia prima por m2
  cardboard_cost_per_m2 DECIMAL(10, 4) NOT NULL DEFAULT 0, -- Costo cartón
  glue_cost_per_m2 DECIMAL(10, 4) NOT NULL DEFAULT 0, -- Pegamento
  ink_cost_per_m2 DECIMAL(10, 4) NOT NULL DEFAULT 0, -- Tintas (si aplica)
  -- Costos de mano de obra por m2
  labor_cost_per_m2 DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- Costos de energía/servicios por m2
  energy_cost_per_m2 DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- Costos adicionales
  waste_percentage DECIMAL(5, 2) NOT NULL DEFAULT 5, -- % desperdicio
  overhead_percentage DECIMAL(5, 2) NOT NULL DEFAULT 10, -- % gastos generales
  -- Vigencia
  effective_from DATE NOT NULL,
  effective_to DATE, -- NULL = vigente
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de gastos operativos registrados (para control mensual)
CREATE TABLE IF NOT EXISTS operational_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES cost_categories(id),
  concept VARCHAR(200) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  expense_date DATE NOT NULL,
  payment_method VARCHAR(50),
  receipt_number VARCHAR(100),
  supplier VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vista materializada para análisis de rentabilidad por orden
CREATE OR REPLACE VIEW order_profitability AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.created_at AS order_date,
  o.status,
  c.id AS client_id,
  c.name AS client_name,
  c.company AS client_company,
  o.total_m2,
  o.subtotal AS revenue_subtotal,
  o.printing_cost AS revenue_printing,
  o.die_cut_cost AS revenue_diecut,
  o.shipping_cost AS revenue_shipping,
  o.total AS total_revenue,
  COALESCE(SUM(oc.amount), 0) AS total_direct_costs,
  o.total - COALESCE(SUM(oc.amount), 0) AS gross_profit,
  CASE
    WHEN o.total > 0 THEN ((o.total - COALESCE(SUM(oc.amount), 0)) / o.total * 100)
    ELSE 0
  END AS gross_margin_percent
FROM orders o
LEFT JOIN clients c ON o.client_id = c.id
LEFT JOIN order_costs oc ON o.id = oc.order_id
WHERE o.status != 'cancelled'
GROUP BY o.id, o.order_number, o.created_at, o.status, c.id, c.name, c.company,
         o.total_m2, o.subtotal, o.printing_cost, o.die_cut_cost, o.shipping_cost, o.total;

-- Insertar categorías de costos por defecto
INSERT INTO cost_categories (name, type, description) VALUES
  ('Materia Prima', 'supply', 'Cartón, papel, materiales base'),
  ('Insumos de Producción', 'supply', 'Pegamento, tintas, barnices'),
  ('Mano de Obra Directa', 'labor', 'Salarios de operarios de producción'),
  ('Mano de Obra Indirecta', 'labor', 'Supervisores, administrativos'),
  ('Energía', 'variable', 'Electricidad, gas'),
  ('Mantenimiento', 'variable', 'Mantenimiento de maquinaria'),
  ('Alquiler', 'fixed', 'Alquiler de planta/oficinas'),
  ('Servicios', 'fixed', 'Internet, teléfono, agua'),
  ('Seguros', 'fixed', 'Seguros de planta, maquinaria, ART'),
  ('Impuestos', 'fixed', 'Impuestos fijos mensuales'),
  ('Transporte', 'variable', 'Combustible, peajes, fletes'),
  ('Packaging', 'supply', 'Material de embalaje para envío'),
  ('Depreciación', 'fixed', 'Depreciación de maquinaria'),
  ('Otros', 'other', 'Gastos varios')
ON CONFLICT DO NOTHING;

-- Insertar configuración de costos de producción inicial
INSERT INTO production_cost_config (
  name,
  cardboard_cost_per_m2,
  glue_cost_per_m2,
  ink_cost_per_m2,
  labor_cost_per_m2,
  energy_cost_per_m2,
  waste_percentage,
  overhead_percentage,
  effective_from
) VALUES (
  'Configuración Inicial',
  350.00,  -- Costo cartón por m2
  15.00,   -- Pegamento por m2
  25.00,   -- Tintas por m2 (promedio)
  80.00,   -- Mano de obra por m2
  20.00,   -- Energía por m2
  5.00,    -- 5% desperdicio
  10.00,   -- 10% overhead
  CURRENT_DATE
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_fixed_costs_category ON fixed_costs(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_active ON fixed_costs(is_active, start_date);
CREATE INDEX IF NOT EXISTS idx_supplies_category ON supplies(category_id);
CREATE INDEX IF NOT EXISTS idx_supplies_active ON supplies(is_active);
CREATE INDEX IF NOT EXISTS idx_supply_price_history_supply ON supply_price_history(supply_id);
CREATE INDEX IF NOT EXISTS idx_order_costs_order ON order_costs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_costs_category ON order_costs(category_id);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_date ON operational_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_operational_expenses_category ON operational_expenses(category_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cost_categories_timestamp
  BEFORE UPDATE ON cost_categories
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

CREATE TRIGGER update_fixed_costs_timestamp
  BEFORE UPDATE ON fixed_costs
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

CREATE TRIGGER update_supplies_timestamp
  BEFORE UPDATE ON supplies
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

CREATE TRIGGER update_order_costs_timestamp
  BEFORE UPDATE ON order_costs
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

CREATE TRIGGER update_production_cost_config_timestamp
  BEFORE UPDATE ON production_cost_config
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

CREATE TRIGGER update_operational_expenses_timestamp
  BEFORE UPDATE ON operational_expenses
  FOR EACH ROW EXECUTE FUNCTION update_costs_updated_at();

-- Trigger para registrar historial de precios de insumos
CREATE OR REPLACE FUNCTION log_supply_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_price IS DISTINCT FROM NEW.current_price THEN
    NEW.last_price = OLD.current_price;
    NEW.price_updated_at = NOW();
    INSERT INTO supply_price_history (supply_id, price, effective_date)
    VALUES (NEW.id, NEW.current_price, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_supply_price_history
  BEFORE UPDATE ON supplies
  FOR EACH ROW EXECUTE FUNCTION log_supply_price_change();
