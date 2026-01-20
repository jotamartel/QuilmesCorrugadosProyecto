-- Migración 009: Tabla de tracking de API requests
-- Para monitorear uso de la API pública por LLMs y agentes

-- Tabla principal de requests
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificación de la request
    endpoint TEXT NOT NULL,          -- Ej: '/api/v1/quote'
    method TEXT NOT NULL DEFAULT 'POST',

    -- Identificación del cliente
    api_key TEXT,                     -- NULL si es request anónima
    user_agent TEXT,                  -- Para identificar bots/LLMs
    ip_address TEXT,                  -- IP del cliente (hashed para privacidad)

    -- Request details
    request_body JSONB,               -- Cuerpo de la request (sin datos sensibles)

    -- Response details
    response_status INTEGER NOT NULL, -- HTTP status code
    response_time_ms INTEGER,         -- Tiempo de respuesta en ms

    -- Categorización
    source_type TEXT DEFAULT 'unknown', -- 'llm', 'api_client', 'browser', 'unknown'
    llm_detected TEXT,                -- 'gpt', 'claude', 'perplexity', etc.

    -- Resultado del cálculo (para análisis)
    total_m2 NUMERIC(12,2),           -- m² cotizados
    total_amount NUMERIC(12,2),       -- Monto total ARS
    boxes_count INTEGER,              -- Cantidad de tipos de cajas

    -- Rate limiting
    rate_limit_remaining INTEGER,      -- Requests restantes en ventana
    rate_limited BOOLEAN DEFAULT FALSE, -- Si fue rechazado por rate limit

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas comunes
CREATE INDEX IF NOT EXISTS idx_api_requests_created_at ON api_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_endpoint ON api_requests(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_requests_source_type ON api_requests(source_type);
CREATE INDEX IF NOT EXISTS idx_api_requests_api_key ON api_requests(api_key) WHERE api_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_requests_llm_detected ON api_requests(llm_detected) WHERE llm_detected IS NOT NULL;

-- Tabla para API Keys (opcional, para clientes con rate limits mayores)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Key info
    key_hash TEXT NOT NULL UNIQUE,    -- Hash SHA-256 del API key
    key_prefix TEXT NOT NULL,         -- Primeros 8 caracteres para identificación
    name TEXT NOT NULL,               -- Nombre descriptivo

    -- Propietario
    owner_email TEXT,
    owner_company TEXT,

    -- Límites
    rate_limit_per_minute INTEGER DEFAULT 100,
    rate_limit_per_day INTEGER DEFAULT 10000,

    -- Estado
    is_active BOOLEAN DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ            -- NULL = no expira
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- Vista para estadísticas diarias
CREATE OR REPLACE VIEW api_requests_daily_stats AS
SELECT
    DATE(created_at) as date,
    endpoint,
    source_type,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN response_status = 200 THEN 1 END) as successful_requests,
    COUNT(CASE WHEN rate_limited THEN 1 END) as rate_limited_requests,
    AVG(response_time_ms)::INTEGER as avg_response_time_ms,
    SUM(total_m2) as total_m2_quoted,
    SUM(total_amount) as total_amount_quoted
FROM api_requests
GROUP BY DATE(created_at), endpoint, source_type;

-- Vista para estadísticas por LLM
CREATE OR REPLACE VIEW api_requests_llm_stats AS
SELECT
    llm_detected,
    COUNT(*) as total_requests,
    COUNT(DISTINCT DATE(created_at)) as days_active,
    MIN(created_at) as first_request,
    MAX(created_at) as last_request,
    SUM(total_m2) as total_m2_quoted,
    AVG(boxes_count)::NUMERIC(10,2) as avg_boxes_per_request
FROM api_requests
WHERE llm_detected IS NOT NULL
GROUP BY llm_detected;

-- Función para limpiar requests antiguas (retención: 90 días)
CREATE OR REPLACE FUNCTION cleanup_old_api_requests()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM api_requests
    WHERE created_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Comentarios
COMMENT ON TABLE api_requests IS 'Tracking de requests a la API pública para análisis y rate limiting';
COMMENT ON TABLE api_keys IS 'API keys para clientes con rate limits elevados';
COMMENT ON COLUMN api_requests.source_type IS 'Tipo de cliente: llm, api_client, browser, unknown';
COMMENT ON COLUMN api_requests.llm_detected IS 'LLM identificado por User-Agent: gpt, claude, perplexity, cohere, etc.';
