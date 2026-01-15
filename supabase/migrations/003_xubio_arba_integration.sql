-- =====================================================
-- Migración: Integración Xubio + ARBA COT
-- Fecha: 2026-01-14
-- Descripción: Agrega tablas y campos para integración
--              con Xubio (ERP) y ARBA COT (transporte)
-- =====================================================

-- =====================================================
-- 1. MODIFICAR TABLA CLIENTS
-- =====================================================

-- Campo para ID de Xubio
ALTER TABLE clients ADD COLUMN IF NOT EXISTS xubio_id TEXT;

-- Código postal (faltaba en schema original)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Condición fiscal del cliente
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_condition TEXT DEFAULT 'responsable_inscripto';
-- Valores válidos: 'responsable_inscripto' | 'monotributista' | 'consumidor_final' | 'exento'

-- Campos de crédito
ALTER TABLE clients ADD COLUMN IF NOT EXISTS has_credit BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_days INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12, 2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_notes TEXT;

-- Índice para búsqueda por xubio_id
CREATE INDEX IF NOT EXISTS idx_clients_xubio_id ON clients(xubio_id) WHERE xubio_id IS NOT NULL;

-- =====================================================
-- 2. MODIFICAR TABLA ORDERS
-- =====================================================

-- Esquema de pago
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_scheme TEXT DEFAULT 'standard';
-- Valores: 'standard' (50%+50%) | 'credit' (100% a plazo)

-- Cantidades confirmadas
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantities_confirmed BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantities_confirmed_at TIMESTAMPTZ;

-- IDs de Xubio para facturación
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_deposit_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_deposit_invoice_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_balance_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_balance_invoice_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_remito_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS xubio_remito_number TEXT;

-- COT ARBA
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cot_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cot_generated_at TIMESTAMPTZ;

-- =====================================================
-- 3. MODIFICAR TABLA ORDER_ITEMS
-- =====================================================

-- Cantidad entregada (puede diferir de la cotizada)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity_delivered INTEGER;

-- =====================================================
-- 4. CREAR TABLA VEHICLES
-- =====================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patent TEXT NOT NULL UNIQUE,
  description TEXT,
  driver_name TEXT,
  driver_cuit TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS vehicles_updated_at ON vehicles;
CREATE TRIGGER vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 5. AGREGAR REFERENCIA DE VEHÍCULO EN ORDERS
-- =====================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);

-- =====================================================
-- 6. CREAR TABLA PAYMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),

  type TEXT NOT NULL, -- 'deposit' (seña) | 'balance' (saldo) | 'full' (pago total)
  amount DECIMAL(12, 2) NOT NULL,
  method TEXT NOT NULL, -- 'transfer' | 'cash' | 'check' | 'echeq'

  -- Datos del cheque (si aplica)
  check_bank TEXT,
  check_number TEXT,
  check_date DATE,
  check_holder TEXT,
  check_cuit TEXT,

  -- Xubio
  xubio_receipt_id TEXT,
  xubio_receipt_number TEXT,

  status TEXT DEFAULT 'pending', -- 'pending' | 'completed' | 'cancelled'
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 7. CREAR TABLA CHECKS (Cheques en cartera)
-- =====================================================

CREATE TABLE IF NOT EXISTS checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id),
  client_id UUID REFERENCES clients(id),

  bank TEXT NOT NULL,
  number TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  issue_date DATE,
  due_date DATE NOT NULL,
  holder TEXT,
  holder_cuit TEXT,

  status TEXT DEFAULT 'in_portfolio',
  -- Valores: 'in_portfolio' | 'deposited' | 'cashed' | 'endorsed' | 'rejected'

  -- Operación de salida
  exit_type TEXT, -- 'deposit' | 'cash' | 'endorsement'
  exit_date TIMESTAMPTZ,
  exit_to TEXT, -- banco o proveedor destino
  exit_notes TEXT,

  -- Xubio
  xubio_id TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para checks
CREATE INDEX IF NOT EXISTS idx_checks_client_id ON checks(client_id);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_checks_due_date ON checks(due_date);
CREATE INDEX IF NOT EXISTS idx_checks_payment_id ON checks(payment_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS checks_updated_at ON checks;
CREATE TRIGGER checks_updated_at
  BEFORE UPDATE ON checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 8. CREAR TABLA SYSTEM_CONFIG
-- =====================================================

CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN DEFAULT false, -- Para campos sensibles como contraseñas
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS system_config_updated_at ON system_config;
CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Insertar configuraciones iniciales
INSERT INTO system_config (key, value, description, is_secret) VALUES
  -- Datos de la empresa
  ('company_name', 'Quilmes Corrugados', 'Nombre de la empresa', false),
  ('company_cuit', '', 'CUIT de la empresa', false),
  ('company_address', '', 'Domicilio fiscal', false),
  ('company_city', 'Quilmes', 'Ciudad', false),
  ('company_province', 'Buenos Aires', 'Provincia', false),
  ('company_postal_code', '', 'Código postal', false),
  ('company_email', '', 'Email de la empresa', false),
  ('company_phone', '', 'Teléfono', false),
  ('company_iibb', '', 'Número de Ingresos Brutos', false),
  ('company_start_date', '', 'Inicio de actividades', false),

  -- Xubio
  ('xubio_client_id', '', 'Client ID de API Xubio', true),
  ('xubio_secret_id', '', 'Secret ID de API Xubio', true),
  ('xubio_enabled', 'false', 'Integración Xubio habilitada', false),
  ('xubio_point_of_sale', '1', 'Punto de venta para facturas', false),

  -- ARBA COT
  ('arba_cit_user', '', 'Usuario CIT de ARBA', true),
  ('arba_cit_password', '', 'Contraseña CIT de ARBA', true),
  ('arba_cot_enabled', 'false', 'Integración COT habilitada', false),
  ('arba_cot_product_code', '16.05.11.10', 'Código de producto para COT (Cajas de cartón)', false),
  ('arba_cot_product_unit', 'UNI', 'Unidad de medida para COT', false)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 9. CREAR TABLA INTEGRATION_LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration TEXT NOT NULL, -- 'xubio' | 'arba'
  operation TEXT NOT NULL, -- 'create_invoice', 'create_receipt', 'generate_cot', etc.
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  request_data JSONB,
  response_data JSONB,

  status TEXT NOT NULL, -- 'success' | 'error' | 'pending'
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para integration_logs
CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration);
CREATE INDEX IF NOT EXISTS idx_integration_logs_operation ON integration_logs(operation);
CREATE INDEX IF NOT EXISTS idx_integration_logs_order_id ON integration_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at ON integration_logs(created_at DESC);

-- =====================================================
-- 10. VISTAS ÚTILES
-- =====================================================

-- Vista de cheques próximos a vencer (7 días)
CREATE OR REPLACE VIEW checks_due_soon AS
SELECT
  c.*,
  cl.name as client_name,
  cl.company as client_company,
  (c.due_date - CURRENT_DATE) as days_until_due
FROM checks c
LEFT JOIN clients cl ON c.client_id = cl.id
WHERE c.status = 'in_portfolio'
  AND c.due_date <= CURRENT_DATE + INTERVAL '7 days'
  AND c.due_date >= CURRENT_DATE
ORDER BY c.due_date ASC;

-- Vista de órdenes pendientes de despacho
CREATE OR REPLACE VIEW orders_ready_to_ship AS
SELECT
  o.*,
  c.name as client_name,
  c.company as client_company,
  c.address as client_address,
  c.city as client_city,
  c.province as client_province,
  c.postal_code as client_postal_code,
  c.tax_condition as client_tax_condition,
  c.has_credit as client_has_credit
FROM orders o
LEFT JOIN clients c ON o.client_id = c.id
WHERE o.status = 'ready'
  AND o.quantities_confirmed = true
ORDER BY o.created_at ASC;

-- Vista de balance de crédito por cliente
CREATE OR REPLACE VIEW client_credit_balance AS
SELECT
  c.id,
  c.name,
  c.company,
  c.credit_limit,
  c.credit_days,
  COALESCE(SUM(
    CASE WHEN o.status NOT IN ('delivered', 'cancelled')
         AND o.payment_scheme = 'credit'
    THEN o.total
    ELSE 0
    END
  ), 0) as pending_amount,
  c.credit_limit - COALESCE(SUM(
    CASE WHEN o.status NOT IN ('delivered', 'cancelled')
         AND o.payment_scheme = 'credit'
    THEN o.total
    ELSE 0
    END
  ), 0) as available_credit
FROM clients c
LEFT JOIN orders o ON c.id = o.client_id
WHERE c.has_credit = true
GROUP BY c.id, c.name, c.company, c.credit_limit, c.credit_days;

-- =====================================================
-- 11. FUNCIONES AUXILIARES
-- =====================================================

-- Función para verificar si Xubio está habilitado
CREATE OR REPLACE FUNCTION is_xubio_enabled()
RETURNS BOOLEAN AS $$
DECLARE
  enabled_value TEXT;
BEGIN
  SELECT value INTO enabled_value
  FROM system_config
  WHERE key = 'xubio_enabled';

  RETURN COALESCE(enabled_value, 'false') = 'true';
END;
$$ LANGUAGE plpgsql;

-- Función para verificar si ARBA COT está habilitado
CREATE OR REPLACE FUNCTION is_arba_cot_enabled()
RETURNS BOOLEAN AS $$
DECLARE
  enabled_value TEXT;
BEGIN
  SELECT value INTO enabled_value
  FROM system_config
  WHERE key = 'arba_cot_enabled';

  RETURN COALESCE(enabled_value, 'false') = 'true';
END;
$$ LANGUAGE plpgsql;

-- Función para obtener configuración
CREATE OR REPLACE FUNCTION get_config(config_key TEXT)
RETURNS TEXT AS $$
DECLARE
  config_value TEXT;
BEGIN
  SELECT value INTO config_value
  FROM system_config
  WHERE key = config_key;

  RETURN config_value;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. POLÍTICAS RLS (si están habilitadas)
-- =====================================================

-- Habilitar RLS en las nuevas tablas
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas (ajustar según necesidades de autenticación)
-- Por ahora permitimos todo ya que la app no tiene auth de usuarios

CREATE POLICY "Allow all on vehicles" ON vehicles FOR ALL USING (true);
CREATE POLICY "Allow all on payments" ON payments FOR ALL USING (true);
CREATE POLICY "Allow all on checks" ON checks FOR ALL USING (true);
CREATE POLICY "Allow all on system_config" ON system_config FOR ALL USING (true);
CREATE POLICY "Allow all on integration_logs" ON integration_logs FOR ALL USING (true);
