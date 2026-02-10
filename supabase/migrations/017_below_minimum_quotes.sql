-- Migración 017: Soporte para cotizaciones menores al mínimo (1000-3000 m2)
-- Permite cotizar pedidos menores a 3000m2 con precio con recargo

-- ═══════════════════════════════════════════════════════════════════════════════
-- AGREGAR CAMPO DE PRECIO MENOR AL MÍNIMO EN PRICING_CONFIG
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE pricing_config 
ADD COLUMN IF NOT EXISTS price_per_m2_below_minimum DECIMAL(10,2);

COMMENT ON COLUMN pricing_config.price_per_m2_below_minimum IS 'Precio por m2 para pedidos menores a 3000m2 (con recargo)';

-- Valor por defecto: precio estándar + 20% (se puede ajustar desde configuración)
UPDATE pricing_config 
SET price_per_m2_below_minimum = price_per_m2_standard * 1.20
WHERE price_per_m2_below_minimum IS NULL AND is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- AGREGAR CAMPOS EN PUBLIC_QUOTES PARA PEDIDOS MENORES AL MÍNIMO
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo para marcar si es un pedido menor al mínimo
ALTER TABLE public_quotes 
ADD COLUMN IF NOT EXISTS is_below_minimum BOOLEAN DEFAULT false;

COMMENT ON COLUMN public_quotes.is_below_minimum IS 'Indica si este pedido es menor al mínimo de 3000m2';

-- Campo para la cantidad solicitada cuando es menor al mínimo
ALTER TABLE public_quotes 
ADD COLUMN IF NOT EXISTS requested_quantity_below_minimum INTEGER;

COMMENT ON COLUMN public_quotes.requested_quantity_below_minimum IS 'Cantidad de cajas solicitada cuando el pedido es menor al mínimo (mínimo 1000m2)';

-- Campo para el precio por m2 aplicado (puede ser el precio con recargo)
ALTER TABLE public_quotes 
ADD COLUMN IF NOT EXISTS price_per_m2_applied DECIMAL(10,2);

COMMENT ON COLUMN public_quotes.price_per_m2_applied IS 'Precio por m2 realmente aplicado (puede ser el precio con recargo si es menor al mínimo)';

-- Campo para indicar si el cliente aceptó las condiciones (sin envío gratis, etc.)
ALTER TABLE public_quotes 
ADD COLUMN IF NOT EXISTS accepted_below_minimum_terms BOOLEAN DEFAULT false;

COMMENT ON COLUMN public_quotes.accepted_below_minimum_terms IS 'Indica si el cliente aceptó las condiciones de pedido menor al mínimo (sin envío gratis, coordinación de producción)';

-- Índice para filtrar pedidos menores al mínimo
CREATE INDEX IF NOT EXISTS idx_public_quotes_below_minimum 
ON public_quotes(is_below_minimum) 
WHERE is_below_minimum = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTUALIZAR CAMPO REQUESTED_CONTACT (si no existe)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verificar si existe el campo requested_contact, si no existe agregarlo
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'public_quotes' 
    AND column_name = 'requested_contact'
  ) THEN
    ALTER TABLE public_quotes 
    ADD COLUMN requested_contact BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public_quotes.requested_contact IS 'Indica si el cliente solicitó ser contactado';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTUALIZAR CAMPOS DE ENVÍO
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verificar si existe el campo distance_km, si no existe agregarlo
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'public_quotes' 
    AND column_name = 'distance_km'
  ) THEN
    ALTER TABLE public_quotes 
    ADD COLUMN distance_km INTEGER;
    
    COMMENT ON COLUMN public_quotes.distance_km IS 'Distancia en km desde la fábrica (para cálculo de envío)';
  END IF;
END $$;

-- Verificar si existe el campo is_free_shipping, si no existe agregarlo
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'public_quotes' 
    AND column_name = 'is_free_shipping'
  ) THEN
    ALTER TABLE public_quotes 
    ADD COLUMN is_free_shipping BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public_quotes.is_free_shipping IS 'Indica si aplica envío gratis (pedidos menores al mínimo no tienen envío gratis)';
  END IF;
END $$;

-- Verificar si existe el campo design_preview_url, si no existe agregarlo
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'public_quotes' 
    AND column_name = 'design_preview_url'
  ) THEN
    ALTER TABLE public_quotes 
    ADD COLUMN design_preview_url TEXT;
    
    COMMENT ON COLUMN public_quotes.design_preview_url IS 'URL de preview del diseño (thumbnail)';
  END IF;
END $$;
