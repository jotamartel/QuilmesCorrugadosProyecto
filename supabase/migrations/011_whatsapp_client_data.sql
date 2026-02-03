-- Quilmes Corrugados - WhatsApp Client Data
-- Agregar campos para capturar datos del cliente antes de cotizar

-- =====================================================
-- ALTER TABLE: Agregar campos de cliente
-- =====================================================

-- Tipo de cliente (particular o empresa)
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IS NULL OR client_type IN ('particular', 'empresa'));

-- Nombre del cliente/contacto
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Nombre de la empresa (solo si es empresa)
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Email del cliente
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS client_email TEXT;

-- =====================================================
-- Actualizar constraint de step para incluir nuevos pasos
-- =====================================================

-- Primero eliminar el constraint existente
ALTER TABLE whatsapp_conversations
DROP CONSTRAINT IF EXISTS whatsapp_conversations_step_check;

-- Agregar nuevo constraint con los nuevos steps
ALTER TABLE whatsapp_conversations
ADD CONSTRAINT whatsapp_conversations_step_check CHECK (step IN (
  'initial',
  'waiting_client_type',
  'waiting_name',
  'waiting_company_info',
  'waiting_dimensions',
  'waiting_quantity',
  'waiting_printing',
  'quoted'
));

-- =====================================================
-- Actualizar la vista para incluir datos del cliente
-- =====================================================
DROP VIEW IF EXISTS whatsapp_conversation_stats;

CREATE VIEW whatsapp_conversation_stats AS
SELECT
  wc.id,
  wc.phone_number,
  wc.step,
  -- Datos del cliente
  wc.client_type,
  wc.client_name,
  wc.company_name,
  wc.client_email,
  -- Datos de cotización
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

-- Índice para búsqueda por email
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client_email ON whatsapp_conversations(client_email);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_company_name ON whatsapp_conversations(company_name);
