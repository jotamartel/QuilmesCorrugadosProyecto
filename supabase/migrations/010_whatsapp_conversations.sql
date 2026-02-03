-- Quilmes Corrugados - WhatsApp Conversations State
-- Estado persistente de conversaciones WhatsApp

-- =====================================================
-- TABLA: whatsapp_conversations
-- Estado de conversaciones de WhatsApp (persistente)
-- =====================================================
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,

  -- Estado de la conversación
  step TEXT NOT NULL DEFAULT 'initial' CHECK (step IN (
    'initial',
    'waiting_dimensions',
    'waiting_quantity',
    'waiting_printing',
    'quoted'
  )),

  -- Datos de cotización en progreso
  dimensions JSONB, -- {length, width, height}
  quantity INTEGER,
  has_printing BOOLEAN,

  -- Última cotización
  last_quote_total DECIMAL(12,2),
  last_quote_m2 DECIMAL(12,4),

  -- Estado de atención
  attended BOOLEAN DEFAULT false,
  attended_at TIMESTAMPTZ,
  attended_by TEXT,
  notes TEXT,

  -- Timestamps
  last_interaction TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_whatsapp_conversations_phone ON whatsapp_conversations(phone_number);
CREATE INDEX idx_whatsapp_conversations_step ON whatsapp_conversations(step);
CREATE INDEX idx_whatsapp_conversations_attended ON whatsapp_conversations(attended);
CREATE INDEX idx_whatsapp_conversations_last_interaction ON whatsapp_conversations(last_interaction);

-- Trigger para updated_at
CREATE TRIGGER whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- Agregar índice en communications para mejorar queries
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_communications_channel ON communications(channel);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications(created_at);
CREATE INDEX IF NOT EXISTS idx_communications_metadata_phone ON communications((metadata->>'phone'));

-- =====================================================
-- Vista para conversaciones con estadísticas
-- =====================================================
CREATE OR REPLACE VIEW whatsapp_conversation_stats AS
SELECT
  wc.id,
  wc.phone_number,
  wc.step,
  wc.dimensions,
  wc.quantity,
  wc.has_printing,
  wc.last_quote_total,
  wc.last_quote_m2,
  wc.attended,
  wc.attended_at,
  wc.attended_by,
  wc.notes,
  wc.last_interaction,
  wc.created_at,
  -- Stats calculadas
  (SELECT COUNT(*) FROM communications c
   WHERE c.metadata->>'phone' = wc.phone_number AND c.channel = 'whatsapp') as message_count,
  (SELECT COUNT(*) FROM communications c
   WHERE c.metadata->>'phone' = wc.phone_number
   AND c.channel = 'whatsapp'
   AND c.metadata->>'quote' IS NOT NULL) as quotes_count,
  (SELECT SUM((c.metadata->'quote'->>'total')::numeric) FROM communications c
   WHERE c.metadata->>'phone' = wc.phone_number
   AND c.channel = 'whatsapp'
   AND c.metadata->>'quote' IS NOT NULL) as total_quoted,
  (SELECT bool_or((c.metadata->>'needsAdvisor')::boolean) FROM communications c
   WHERE c.metadata->>'phone' = wc.phone_number AND c.channel = 'whatsapp') as needs_advisor
FROM whatsapp_conversations wc;
