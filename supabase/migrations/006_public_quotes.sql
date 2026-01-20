/**
 * Migración 006: Sistema de Cotizaciones Públicas (Web)
 *
 * - Crea tabla public_quotes para cotizaciones del sitio web público
 * - Agrega campo source a clients para trackear origen
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- MODIFICACIONES A TABLA CLIENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo source: origen del cliente
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
COMMENT ON COLUMN clients.source IS 'Origen del cliente: manual, web, email, whatsapp';

-- Campo source_quote_id: cotización web que originó este cliente
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_quote_id UUID;
COMMENT ON COLUMN clients.source_quote_id IS 'ID de la cotización pública que originó este cliente';

-- Campo created_from_ip: IP de origen (solo para web)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_from_ip TEXT;
COMMENT ON COLUMN clients.created_from_ip IS 'IP de origen cuando el cliente se creó desde web';

-- Índice para filtrar por origen
CREATE INDEX IF NOT EXISTS idx_clients_source ON clients(source);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA PUBLIC_QUOTES (Cotizaciones Públicas)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number SERIAL,

  -- ═══════════════════════════════════════════════════════════
  -- DATOS DEL SOLICITANTE
  -- ═══════════════════════════════════════════════════════════

  -- Datos básicos (requeridos)
  requester_name TEXT NOT NULL,           -- Nombre o Razón Social
  requester_company TEXT,                  -- Nombre de fantasía (opcional)
  requester_email TEXT NOT NULL,
  requester_phone TEXT NOT NULL,

  -- Datos fiscales (opcionales en cotización)
  requester_cuit TEXT,
  requester_tax_condition TEXT DEFAULT 'consumidor_final',
  -- Valores: 'responsable_inscripto' | 'monotributista' | 'consumidor_final' | 'exento'

  -- Dirección (opcional)
  address TEXT,
  city TEXT,
  province TEXT DEFAULT 'Buenos Aires',
  postal_code TEXT,

  -- ═══════════════════════════════════════════════════════════
  -- DATOS DE LA CAJA
  -- ═══════════════════════════════════════════════════════════

  length_mm INTEGER NOT NULL,
  width_mm INTEGER NOT NULL,
  height_mm INTEGER NOT NULL,
  quantity INTEGER NOT NULL,

  -- Opciones de impresión
  has_printing BOOLEAN DEFAULT false,
  printing_colors INTEGER DEFAULT 0,

  -- Archivo de diseño (opcional)
  design_file_url TEXT,
  design_file_name TEXT,

  -- ═══════════════════════════════════════════════════════════
  -- CÁLCULOS GUARDADOS
  -- ═══════════════════════════════════════════════════════════

  sheet_width_mm INTEGER,                  -- Ancho de plancha calculado
  sheet_length_mm INTEGER,                 -- Largo de plancha calculado
  sqm_per_box DECIMAL(10,4),              -- m² por caja
  total_sqm DECIMAL(10,2),                -- m² totales
  price_per_m2 DECIMAL(10,2),             -- Precio por m² aplicado
  unit_price DECIMAL(10,2),               -- Precio unitario por caja
  subtotal DECIMAL(12,2),                 -- Subtotal sin costos adicionales
  estimated_days INTEGER,                  -- Días de producción estimados

  -- ═══════════════════════════════════════════════════════════
  -- METADATA Y TRACKING
  -- ═══════════════════════════════════════════════════════════

  source_ip TEXT,                          -- IP del visitante
  source_user_agent TEXT,                  -- User agent del navegador
  message TEXT,                            -- Mensaje adicional del cliente

  -- ═══════════════════════════════════════════════════════════
  -- ESTADO Y CONVERSIÓN
  -- ═══════════════════════════════════════════════════════════

  status TEXT DEFAULT 'pending',
  -- Valores: 'pending' | 'contacted' | 'converted' | 'rejected'

  notes TEXT,                              -- Notas internas

  -- Referencias a entidades creadas al convertir
  converted_to_client_id UUID REFERENCES clients(id),
  converted_to_quote_id UUID REFERENCES quotes(id),
  converted_at TIMESTAMPTZ,
  converted_by TEXT,                       -- Usuario que convirtió

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_public_quotes_status ON public_quotes(status);
CREATE INDEX IF NOT EXISTS idx_public_quotes_created ON public_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_quotes_email ON public_quotes(requester_email);
CREATE INDEX IF NOT EXISTS idx_public_quotes_cuit ON public_quotes(requester_cuit) WHERE requester_cuit IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER PARA UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_public_quotes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS public_quotes_updated_at ON public_quotes;
CREATE TRIGGER public_quotes_updated_at
  BEFORE UPDATE ON public_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_public_quotes_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRAINT DE STATUS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public_quotes DROP CONSTRAINT IF EXISTS public_quotes_status_check;
ALTER TABLE public_quotes ADD CONSTRAINT public_quotes_status_check
  CHECK (status IN ('pending', 'contacted', 'converted', 'rejected'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRAINT DE TAX CONDITION
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public_quotes DROP CONSTRAINT IF EXISTS public_quotes_tax_condition_check;
ALTER TABLE public_quotes ADD CONSTRAINT public_quotes_tax_condition_check
  CHECK (requester_tax_condition IN ('responsable_inscripto', 'monotributista', 'consumidor_final', 'exento'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMENTARIOS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public_quotes IS 'Cotizaciones recibidas desde el sitio web público';
COMMENT ON COLUMN public_quotes.quote_number IS 'Número secuencial de cotización web (QW-XXXX)';
COMMENT ON COLUMN public_quotes.status IS 'Estado: pending (nueva), contacted (contactado), converted (convertido a cliente/cotización), rejected (rechazado)';
