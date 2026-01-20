/**
 * Migración 008: Diferenciación de Leads vs Cotizaciones Web
 *
 * Agrega campo requested_contact para diferenciar:
 * - Leads: visitantes que vieron el precio pero NO solicitaron contacto
 * - Cotizaciones Web: visitantes que SÍ solicitaron ser contactados
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- CAMPO REQUESTED_CONTACT
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo para marcar si el visitante solicitó ser contactado
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS requested_contact BOOLEAN DEFAULT false;
COMMENT ON COLUMN public_quotes.requested_contact IS 'true = solicitó contacto (cotización web), false = solo vio precio (lead)';

-- Índice para filtrar leads vs cotizaciones
CREATE INDEX IF NOT EXISTS idx_public_quotes_requested_contact ON public_quotes(requested_contact);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CAMPOS DE ENVÍO
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo de distancia (si el usuario ingresó dirección)
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS distance_km INTEGER;
COMMENT ON COLUMN public_quotes.distance_km IS 'Distancia en km desde Quilmes (calculada desde ciudad seleccionada)';

-- Campo de envío gratis
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS is_free_shipping BOOLEAN DEFAULT false;
COMMENT ON COLUMN public_quotes.is_free_shipping IS 'true si aplica envío gratis (<= 60km)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTUALIZAR REGISTROS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Asumir que los registros existentes con status distinto de 'pending'
-- son cotizaciones web (ya fueron procesados)
UPDATE public_quotes
SET requested_contact = true
WHERE status != 'pending' AND requested_contact IS NULL;

-- Los pendientes sin contacto previo son leads
UPDATE public_quotes
SET requested_contact = false
WHERE status = 'pending' AND requested_contact IS NULL;
