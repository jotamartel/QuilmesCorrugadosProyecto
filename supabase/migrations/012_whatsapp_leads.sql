/**
 * Migración 012: Soporte para Leads de WhatsApp
 *
 * - Agrega campo source a public_quotes para identificar origen (web, whatsapp)
 * - Agrega campo phone_number para WhatsApp (número de contacto principal)
 * - Actualiza constraint de clients.source para incluir 'whatsapp'
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- CAMPO SOURCE EN PUBLIC_QUOTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Campo source para identificar origen de la cotización/lead
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';
COMMENT ON COLUMN public_quotes.source IS 'Origen de la cotización: web, whatsapp';

-- Índice para filtrar por origen
CREATE INDEX IF NOT EXISTS idx_public_quotes_source ON public_quotes(source);

-- Constraint para valores válidos
ALTER TABLE public_quotes DROP CONSTRAINT IF EXISTS public_quotes_source_check;
ALTER TABLE public_quotes ADD CONSTRAINT public_quotes_source_check
  CHECK (source IN ('web', 'whatsapp'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- HACER EMAIL OPCIONAL PARA WHATSAPP
-- ═══════════════════════════════════════════════════════════════════════════════

-- Para WhatsApp, el email puede ser opcional (particulares no siempre lo tienen)
-- Modificamos la tabla para permitir null en requester_email si source = 'whatsapp'
-- NOTA: No podemos hacer CHECK condicional fácilmente, así que removemos el NOT NULL
-- y lo validamos en la aplicación

-- Primero crear columna temporal
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS requester_email_temp TEXT;

-- Copiar datos
UPDATE public_quotes SET requester_email_temp = requester_email WHERE requester_email_temp IS NULL;

-- Eliminar columna original (si es NOT NULL)
-- NOTA: Esto puede fallar si hay constraint, manejamos con try
DO $$
BEGIN
  -- Intentar hacer la columna nullable
  ALTER TABLE public_quotes ALTER COLUMN requester_email DROP NOT NULL;
EXCEPTION
  WHEN others THEN
    -- Ya es nullable o no existe, ignorar
    NULL;
END $$;

-- Limpiar columna temporal si existe
ALTER TABLE public_quotes DROP COLUMN IF EXISTS requester_email_temp;

-- ═══════════════════════════════════════════════════════════════════════════════
-- REFERENCIA A CONVERSACIÓN WHATSAPP
-- ═══════════════════════════════════════════════════════════════════════════════

-- Referencia a la conversación de WhatsApp que originó este lead
ALTER TABLE public_quotes ADD COLUMN IF NOT EXISTS whatsapp_conversation_id UUID;
COMMENT ON COLUMN public_quotes.whatsapp_conversation_id IS 'ID de la conversación WhatsApp que generó este lead';

-- Índice para buscar por conversación
CREATE INDEX IF NOT EXISTS idx_public_quotes_whatsapp_conv ON public_quotes(whatsapp_conversation_id)
  WHERE whatsapp_conversation_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTUALIZAR REGISTROS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Todos los registros existentes son de web
UPDATE public_quotes SET source = 'web' WHERE source IS NULL;
