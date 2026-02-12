-- Quilmes Corrugados - Omnicanalidad: Contact Profiles y vinculación
-- WhatsApp como hub, perfil unificado, enriquecimiento de empresa

-- =====================================================
-- 1. ALTER: whatsapp_conversations - agregar client_id
-- =====================================================
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_source TEXT DEFAULT 'whatsapp' CHECK (contact_source IN ('whatsapp', 'web', 'phone'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client ON whatsapp_conversations(client_id);

-- =====================================================
-- 2. TABLA: contact_profiles
-- Perfil unificado por teléfono (antes o en paralelo a client)
-- =====================================================
CREATE TABLE IF NOT EXISTS contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  email TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  display_name TEXT,
  company_name TEXT,
  company_enriched_at TIMESTAMPTZ,
  company_enrichment JSONB,

  preferred_channel TEXT DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp', 'email', 'phone')),
  preferred_channel_updated_at TIMESTAMPTZ,

  last_order_at TIMESTAMPTZ,
  last_order_total DECIMAL(12,2),
  total_orders INTEGER DEFAULT 0,
  total_m2 DECIMAL(12,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_profiles_client ON contact_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_company ON contact_profiles(company_name);

CREATE TRIGGER contact_profiles_updated_at
  BEFORE UPDATE ON contact_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 3. TABLA: company_enrichments
-- Cache de búsquedas de empresas (evitar repetir)
-- =====================================================
CREATE TABLE IF NOT EXISTS company_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_name_normalized TEXT NOT NULL,
  enrichment_data JSONB NOT NULL,
  source TEXT DEFAULT 'google' CHECK (source IN ('google', 'manual')),
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_company_enrichments_normalized ON company_enrichments(company_name_normalized);

-- =====================================================
-- 4. Función: normalizar teléfono para matching
-- =====================================================
CREATE OR REPLACE FUNCTION normalize_phone_for_match(p TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p IS NULL OR p = '' THEN RETURN NULL; END IF;
  RETURN regexp_replace(
    regexp_replace(
      regexp_replace(p, '[^0-9]', '', 'g'),
      '^54', ''
    ),
    '^9', ''
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 5. Comentarios para documentación
-- =====================================================
COMMENT ON TABLE contact_profiles IS 'Perfil unificado por teléfono: historial, empresa, compras. Se vincula a clients cuando hay match.';
COMMENT ON TABLE company_enrichments IS 'Cache de búsquedas externas (Google/Serper) para enriquecer datos de empresas.';
COMMENT ON COLUMN whatsapp_conversations.client_id IS 'Cliente identificado por match de teléfono/whatsapp con clients.';
