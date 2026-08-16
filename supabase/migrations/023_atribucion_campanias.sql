-- ============================================================================
-- 023 — Atribución de campañas
-- ============================================================================
-- Hoy hay 7.031 visitas registradas y 183 cotizaciones, y ninguna forma de
-- conectar una con otra: public_quotes no tiene una sola columna que diga de
-- dónde vino el cliente. Con eso no se puede saber qué campaña funciona, y
-- cualquier inversión en pauta se hace a ciegas.
--
-- Se guarda el PRIMER contacto (de dónde vino la primera vez) y el ÚLTIMO
-- (qué lo trajo el día que cotizó). Los dos importan y cuentan historias
-- distintas: el primero dice qué campaña genera demanda nueva, el último qué
-- campaña cierra.
--
-- gclid y fbclid son los identificadores de clic de Google y Meta. Sirven para
-- devolverles la conversión cuando la cotización se convierte en venta, que es
-- lo que permite que optimicen por ingreso real y no por formularios enviados.
-- ============================================================================

ALTER TABLE public_quotes
  -- Último contacto: la visita en la que cotizó
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  -- Identificadores de clic, para reportar conversiones offline
  ADD COLUMN IF NOT EXISTS gclid             TEXT,
  ADD COLUMN IF NOT EXISTS fbclid            TEXT,
  -- Contexto de la visita
  ADD COLUMN IF NOT EXISTS landing_page      TEXT,
  ADD COLUMN IF NOT EXISTS referrer          TEXT,
  -- Primer contacto: cómo nos conoció, aunque haya vuelto por otro lado
  ADD COLUMN IF NOT EXISTS first_utm_source  TEXT,
  ADD COLUMN IF NOT EXISTS first_utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS first_landing_page TEXT,
  -- Puente con el tracking de visitas: permite reconstruir el recorrido
  ADD COLUMN IF NOT EXISTS visitor_id        TEXT,
  ADD COLUMN IF NOT EXISTS session_id        TEXT;

COMMENT ON COLUMN public_quotes.utm_source IS
  'Origen de la visita en la que cotizó (google, facebook, instagram...). Ultimo contacto.';
COMMENT ON COLUMN public_quotes.first_utm_source IS
  'Origen de la PRIMERA visita de este visitante. Dice que campaña genera demanda nueva.';
COMMENT ON COLUMN public_quotes.gclid IS
  'Google Click ID. Necesario para importar la conversion a Google Ads cuando la cotizacion se cierra.';
COMMENT ON COLUMN public_quotes.fbclid IS
  'Facebook Click ID. Idem para la API de Conversiones de Meta.';
COMMENT ON COLUMN public_quotes.visitor_id IS
  'Une la cotizacion con web_visits para reconstruir cuantas visitas hubo antes de cotizar.';

-- Indices para los reportes por campaña y para cerrar el circuito de conversiones.
CREATE INDEX IF NOT EXISTS idx_pq_utm_campaign ON public_quotes (utm_campaign)
  WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pq_utm_source   ON public_quotes (utm_source)
  WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pq_gclid        ON public_quotes (gclid)
  WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pq_visitor      ON public_quotes (visitor_id)
  WHERE visitor_id IS NOT NULL;
