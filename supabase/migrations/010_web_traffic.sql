-- Migración 010: Tabla de tracking de tráfico web en tiempo real
-- Para monitorear visitantes, páginas vistas y eventos en vivo

-- Tabla principal de visitas
CREATE TABLE IF NOT EXISTS web_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación de la sesión
    session_id TEXT NOT NULL,              -- ID único de sesión del navegador
    visitor_id TEXT NOT NULL,               -- ID único del visitante (persistente)
    
    -- Información de la visita
    page_path TEXT NOT NULL,                -- Ruta de la página (ej: '/', '/productos')
    page_title TEXT,                        -- Título de la página
    referrer TEXT,                          -- URL de referencia
    referrer_domain TEXT,                   -- Dominio de referencia extraído
    
    -- Información del dispositivo/navegador
    user_agent TEXT,                        -- User agent completo
    browser_name TEXT,                      -- Chrome, Firefox, Safari, etc.
    browser_version TEXT,
    device_type TEXT,                        -- 'desktop', 'mobile', 'tablet'
    os_name TEXT,                           -- Windows, macOS, iOS, Android, etc.
    screen_width INTEGER,
    screen_height INTEGER,
    
    -- Información geográfica (basada en IP)
    ip_address TEXT,                        -- IP hasheada para privacidad
    country_code TEXT,                      -- Código de país (AR, US, etc.)
    region TEXT,                            -- Provincia/estado
    city TEXT,                              -- Ciudad
    
    -- Métricas de la visita
    time_on_page_seconds INTEGER,          -- Tiempo en la página (si se puede calcular)
    scroll_depth INTEGER,                   -- Porcentaje de scroll (0-100)
    
    -- Eventos especiales
    event_type TEXT DEFAULT 'page_view',    -- 'page_view', 'quote_started', 'quote_completed', 'lead_submitted'
    event_data JSONB,                       -- Datos adicionales del evento
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de sesiones activas (para tráfico en vivo)
CREATE TABLE IF NOT EXISTS active_sessions (
    session_id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    page_count INTEGER DEFAULT 1,
    current_page TEXT,
    referrer TEXT,
    device_type TEXT,
    country_code TEXT,
    city TEXT,
    is_bot BOOLEAN DEFAULT FALSE
);

-- Índices para consultas comunes
CREATE INDEX IF NOT EXISTS idx_web_visits_created_at ON web_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_visits_session_id ON web_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_web_visits_visitor_id ON web_visits(visitor_id);
CREATE INDEX IF NOT EXISTS idx_web_visits_page_path ON web_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_web_visits_event_type ON web_visits(event_type);
CREATE INDEX IF NOT EXISTS idx_web_visits_country_code ON web_visits(country_code);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_seen ON active_sessions(last_seen_at DESC);

-- Función para limpiar sesiones inactivas (más de 30 minutos sin actividad)
CREATE OR REPLACE FUNCTION cleanup_inactive_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM active_sessions 
    WHERE last_seen_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_web_visits_updated_at
    BEFORE UPDATE ON web_visits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Vista para estadísticas de tráfico en tiempo real
CREATE OR REPLACE VIEW traffic_live_stats AS
SELECT 
    COUNT(DISTINCT session_id) as active_visitors,
    COUNT(*) as total_page_views,
    COUNT(DISTINCT page_path) as unique_pages,
    COUNT(DISTINCT visitor_id) as unique_visitors_24h,
    MAX(created_at) as last_activity
FROM web_visits
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Vista para páginas más visitadas (últimas 24h)
CREATE OR REPLACE VIEW top_pages_24h AS
SELECT 
    page_path,
    page_title,
    COUNT(*) as views,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    AVG(time_on_page_seconds) as avg_time_seconds,
    MAX(created_at) as last_view
FROM web_visits
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY page_path, page_title
ORDER BY views DESC
LIMIT 20;

-- Vista para fuentes de tráfico (últimas 24h)
CREATE OR REPLACE VIEW traffic_sources_24h AS
SELECT 
    CASE 
        WHEN referrer_domain IS NULL OR referrer_domain = '' THEN 'Directo'
        WHEN referrer_domain LIKE '%google%' THEN 'Google'
        WHEN referrer_domain LIKE '%facebook%' OR referrer_domain LIKE '%instagram%' THEN 'Meta'
        WHEN referrer_domain LIKE '%bing%' THEN 'Bing'
        ELSE referrer_domain
    END as source,
    COUNT(*) as visits,
    COUNT(DISTINCT session_id) as unique_sessions
FROM web_visits
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY source
ORDER BY visits DESC;

-- Vista para dispositivos (últimas 24h)
CREATE OR REPLACE VIEW device_stats_24h AS
SELECT 
    COALESCE(device_type, 'unknown') as device_type,
    COUNT(*) as visits,
    COUNT(DISTINCT session_id) as unique_sessions
FROM web_visits
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY device_type
ORDER BY visits DESC;

-- Vista para países (últimas 24h)
CREATE OR REPLACE VIEW country_stats_24h AS
SELECT 
    COALESCE(country_code, 'unknown') as country_code,
    COUNT(*) as visits,
    COUNT(DISTINCT session_id) as unique_sessions
FROM web_visits
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY country_code
ORDER BY visits DESC;

-- Función para obtener visitas por hora
CREATE OR REPLACE FUNCTION get_hourly_visits(hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
    hour_timestamp TIMESTAMPTZ,
    visits_count BIGINT,
    unique_sessions BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('hour', created_at) as hour_timestamp,
        COUNT(*) as visits_count,
        COUNT(DISTINCT session_id) as unique_sessions
    FROM web_visits
    WHERE created_at > NOW() - (hours_back || ' hours')::INTERVAL
    GROUP BY DATE_TRUNC('hour', created_at)
    ORDER BY hour_timestamp DESC;
END;
$$ LANGUAGE plpgsql;
