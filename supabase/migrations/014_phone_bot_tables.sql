/**
 * Migración 014: Tablas para Bot Telefónico (Retell AI)
 *
 * - Crea tabla llamadas para registrar llamadas telefónicas
 * - Crea tabla transferencias para registrar intentos de transferencia
 * - Agrega campos a tablas existentes para tracking de canal
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA LLAMADAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llamadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT UNIQUE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript JSONB,
  status TEXT DEFAULT 'in_progress',
  sentiment TEXT,
  summary TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para llamadas
CREATE INDEX IF NOT EXISTS idx_llamadas_call_id ON llamadas(call_id);
CREATE INDEX IF NOT EXISTS idx_llamadas_from_number ON llamadas(from_number);
CREATE INDEX IF NOT EXISTS idx_llamadas_started_at ON llamadas(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_llamadas_status ON llamadas(status);

-- Constraint de status
ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_status_check;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_status_check
  CHECK (status IN ('in_progress', 'completed', 'failed', 'transferred'));

-- Constraint de sentiment
ALTER TABLE llamadas DROP CONSTRAINT IF EXISTS llamadas_sentiment_check;
ALTER TABLE llamadas ADD CONSTRAINT llamadas_sentiment_check
  CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative'));

-- Comentarios
COMMENT ON TABLE llamadas IS 'Registro de llamadas telefónicas atendidas por el bot';
COMMENT ON COLUMN llamadas.call_id IS 'ID único de la llamada en Retell';
COMMENT ON COLUMN llamadas.from_number IS 'Número de teléfono del cliente';
COMMENT ON COLUMN llamadas.transcript IS 'Transcripción de la conversación en formato JSON';
COMMENT ON COLUMN llamadas.sentiment IS 'Sentimiento detectado: positive, neutral, negative';

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_llamadas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS llamadas_updated_at ON llamadas;
CREATE TRIGGER llamadas_updated_at
  BEFORE UPDATE ON llamadas
  FOR EACH ROW
  EXECUTE FUNCTION update_llamadas_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLA TRANSFERENCIAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT REFERENCES llamadas(call_id),
  from_number TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'pending',
  horario_laboral BOOLEAN DEFAULT false,
  motivo TEXT,
  callback_scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para transferencias
CREATE INDEX IF NOT EXISTS idx_transferencias_call_id ON transferencias(call_id);
CREATE INDEX IF NOT EXISTS idx_transferencias_status ON transferencias(status);
CREATE INDEX IF NOT EXISTS idx_transferencias_requested_at ON transferencias(requested_at DESC);

-- Constraint de status
ALTER TABLE transferencias DROP CONSTRAINT IF EXISTS transferencias_status_check;
ALTER TABLE transferencias ADD CONSTRAINT transferencias_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'callback_scheduled'));

-- Comentarios
COMMENT ON TABLE transferencias IS 'Registro de intentos de transferencia a ventas';
COMMENT ON COLUMN transferencias.horario_laboral IS 'Si la transferencia se solicitó en horario laboral';
COMMENT ON COLUMN transferencias.callback_scheduled_at IS 'Fecha/hora programada para callback si fuera de horario';

-- ═══════════════════════════════════════════════════════════════════════════════
-- MODIFICACIONES A TABLAS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Agregar campo canal a public_quotes (cotizaciones web/whatsapp/telefono)
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'web';
COMMENT ON COLUMN public_quotes.canal IS 'Canal de origen: web, whatsapp, telefono';

-- Agregar campos de teléfono a public_quotes
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS call_id TEXT;
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS telefono_cliente TEXT;

-- Índice para filtrar por canal
CREATE INDEX IF NOT EXISTS idx_public_quotes_canal ON public_quotes(canal);

-- Constraint para canal en public_quotes
ALTER TABLE public_quotes DROP CONSTRAINT IF EXISTS public_quotes_canal_check;
ALTER TABLE public_quotes ADD CONSTRAINT public_quotes_canal_check
  CHECK (canal IN ('web', 'whatsapp', 'telefono'));

-- Agregar campo canal a clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS canal_origen TEXT;
COMMENT ON COLUMN clients.canal_origen IS 'Canal por el cual el cliente llegó originalmente';

-- Agregar campo call_id a clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS call_id TEXT;
COMMENT ON COLUMN clients.call_id IS 'ID de la llamada que originó este cliente';

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTUALIZAR REGISTROS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Actualizar canal de public_quotes existentes según source
UPDATE public_quotes
SET canal = CASE
  WHEN source = 'whatsapp' THEN 'whatsapp'
  ELSE 'web'
END
WHERE canal IS NULL OR canal = 'web';
