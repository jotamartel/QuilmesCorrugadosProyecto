-- Migración 016: Vistas y funciones para funnels de conversión
-- Análisis de embudo de conversión desde landing hasta cotización completada

-- Vista para el funnel principal de cotización
CREATE OR REPLACE VIEW conversion_funnel AS
WITH event_counts AS (
  SELECT 
    DATE_TRUNC('day', created_at) as date,
    event_type,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    COUNT(DISTINCT session_id) as unique_sessions,
    COUNT(*) as total_events
  FROM web_visits
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND event_type IN (
      'landing_page_view',
      'quoter_viewed',
      'quote_started',
      'quote_step_2',
      'price_revealed',
      'quote_submitted'
    )
  GROUP BY DATE_TRUNC('day', created_at), event_type
),
funnel_steps AS (
  SELECT 
    date,
    SUM(CASE WHEN event_type = 'landing_page_view' THEN unique_visitors ELSE 0 END) as landing_visitors,
    SUM(CASE WHEN event_type = 'quoter_viewed' THEN unique_visitors ELSE 0 END) as quoter_viewed,
    SUM(CASE WHEN event_type = 'quote_started' THEN unique_visitors ELSE 0 END) as quote_started,
    SUM(CASE WHEN event_type = 'quote_step_2' THEN unique_visitors ELSE 0 END) as quote_step_2,
    SUM(CASE WHEN event_type = 'price_revealed' THEN unique_visitors ELSE 0 END) as price_revealed,
    SUM(CASE WHEN event_type = 'quote_submitted' THEN unique_visitors ELSE 0 END) as quote_submitted
  FROM event_counts
  GROUP BY date
)
SELECT 
  date,
  landing_visitors,
  quoter_viewed,
  quote_started,
  quote_step_2,
  price_revealed,
  quote_submitted,
  -- Tasas de conversión
  CASE 
    WHEN landing_visitors > 0 
    THEN ROUND((quoter_viewed::NUMERIC / landing_visitors::NUMERIC) * 100, 2)
    ELSE 0 
  END as quoter_view_rate,
  CASE 
    WHEN quoter_viewed > 0 
    THEN ROUND((quote_started::NUMERIC / quoter_viewed::NUMERIC) * 100, 2)
    ELSE 0 
  END as quote_start_rate,
  CASE 
    WHEN quote_started > 0 
    THEN ROUND((quote_step_2::NUMERIC / quote_started::NUMERIC) * 100, 2)
    ELSE 0 
  END as step_2_rate,
  CASE 
    WHEN quote_step_2 > 0 
    THEN ROUND((price_revealed::NUMERIC / quote_step_2::NUMERIC) * 100, 2)
    ELSE 0 
  END as price_reveal_rate,
  CASE 
    WHEN price_revealed > 0 
    THEN ROUND((quote_submitted::NUMERIC / price_revealed::NUMERIC) * 100, 2)
    ELSE 0 
  END as submission_rate,
  -- Tasa de conversión total (landing → submitted)
  CASE 
    WHEN landing_visitors > 0 
    THEN ROUND((quote_submitted::NUMERIC / landing_visitors::NUMERIC) * 100, 2)
    ELSE 0 
  END as overall_conversion_rate
FROM funnel_steps
ORDER BY date DESC;

-- Vista para funnel agregado (últimos 30 días)
CREATE OR REPLACE VIEW conversion_funnel_summary AS
WITH totals AS (
  SELECT 
    COUNT(DISTINCT CASE WHEN event_type = 'landing_page_view' THEN visitor_id END) as landing_visitors,
    COUNT(DISTINCT CASE WHEN event_type = 'quoter_viewed' THEN visitor_id END) as quoter_viewed,
    COUNT(DISTINCT CASE WHEN event_type = 'quote_started' THEN visitor_id END) as quote_started,
    COUNT(DISTINCT CASE WHEN event_type = 'quote_step_2' THEN visitor_id END) as quote_step_2,
    COUNT(DISTINCT CASE WHEN event_type = 'price_revealed' THEN visitor_id END) as price_revealed,
    COUNT(DISTINCT CASE WHEN event_type = 'quote_submitted' THEN visitor_id END) as quote_submitted
  FROM web_visits
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND event_type IN (
      'landing_page_view',
      'quoter_viewed',
      'quote_started',
      'quote_step_2',
      'price_revealed',
      'quote_submitted'
    )
)
SELECT 
  landing_visitors,
  quoter_viewed,
  quote_started,
  quote_step_2,
  price_revealed,
  quote_submitted,
  -- Tasas de conversión
  CASE 
    WHEN landing_visitors > 0 
    THEN ROUND((quoter_viewed::NUMERIC / landing_visitors::NUMERIC) * 100, 2)
    ELSE 0 
  END as quoter_view_rate,
  CASE 
    WHEN quoter_viewed > 0 
    THEN ROUND((quote_started::NUMERIC / quoter_viewed::NUMERIC) * 100, 2)
    ELSE 0 
  END as quote_start_rate,
  CASE 
    WHEN quote_started > 0 
    THEN ROUND((quote_step_2::NUMERIC / quote_started::NUMERIC) * 100, 2)
    ELSE 0 
  END as step_2_rate,
  CASE 
    WHEN quote_step_2 > 0 
    THEN ROUND((price_revealed::NUMERIC / quote_step_2::NUMERIC) * 100, 2)
    ELSE 0 
  END as price_reveal_rate,
  CASE 
    WHEN price_revealed > 0 
    THEN ROUND((quote_submitted::NUMERIC / price_revealed::NUMERIC) * 100, 2)
    ELSE 0 
  END as submission_rate,
  -- Tasa de conversión total
  CASE 
    WHEN landing_visitors > 0 
    THEN ROUND((quote_submitted::NUMERIC / landing_visitors::NUMERIC) * 100, 2)
    ELSE 0 
  END as overall_conversion_rate
FROM totals;

-- Vista para análisis de abandono por paso
CREATE OR REPLACE VIEW funnel_dropoff_analysis AS
WITH step_progression AS (
  SELECT 
    visitor_id,
    session_id,
    MIN(CASE WHEN event_type = 'landing_page_view' THEN created_at END) as landing_time,
    MIN(CASE WHEN event_type = 'quoter_viewed' THEN created_at END) as quoter_time,
    MIN(CASE WHEN event_type = 'quote_started' THEN created_at END) as quote_start_time,
    MIN(CASE WHEN event_type = 'quote_step_2' THEN created_at END) as step_2_time,
    MIN(CASE WHEN event_type = 'price_revealed' THEN created_at END) as price_reveal_time,
    MIN(CASE WHEN event_type = 'quote_submitted' THEN created_at END) as submit_time
  FROM web_visits
  WHERE created_at > NOW() - INTERVAL '30 days'
    AND event_type IN (
      'landing_page_view',
      'quoter_viewed',
      'quote_started',
      'quote_step_2',
      'price_revealed',
      'quote_submitted'
    )
  GROUP BY visitor_id, session_id
)
SELECT 
  COUNT(*) as total_sessions,
  COUNT(landing_time) as reached_landing,
  COUNT(quoter_time) as reached_quoter,
  COUNT(quote_start_time) as reached_quote_start,
  COUNT(step_2_time) as reached_step_2,
  COUNT(price_reveal_time) as reached_price_reveal,
  COUNT(submit_time) as reached_submit,
  -- Abandonos en cada paso
  COUNT(landing_time) - COUNT(quoter_time) as dropped_at_landing,
  COUNT(quoter_time) - COUNT(quote_start_time) as dropped_at_quoter,
  COUNT(quote_start_time) - COUNT(step_2_time) as dropped_at_quote_start,
  COUNT(step_2_time) - COUNT(price_reveal_time) as dropped_at_step_2,
  COUNT(price_reveal_time) - COUNT(submit_time) as dropped_at_price_reveal
FROM step_progression
WHERE landing_time IS NOT NULL;

-- Vista para eventos de contacto (WhatsApp, teléfono, email)
CREATE OR REPLACE VIEW contact_events_summary AS
SELECT 
  event_type,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(*) as total_events,
  DATE_TRUNC('day', created_at) as date
FROM web_visits
WHERE created_at > NOW() - INTERVAL '30 days'
  AND event_type IN ('whatsapp_click', 'phone_click', 'email_click')
GROUP BY event_type, DATE_TRUNC('day', created_at)
ORDER BY date DESC, event_type;

-- Función para obtener funnel por período
CREATE OR REPLACE FUNCTION get_conversion_funnel(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  step_name TEXT,
  visitors BIGINT,
  conversion_rate NUMERIC,
  dropoff_count BIGINT,
  dropoff_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH funnel_data AS (
    SELECT 
      COUNT(DISTINCT CASE WHEN event_type = 'landing_page_view' THEN visitor_id END) as landing,
      COUNT(DISTINCT CASE WHEN event_type = 'quoter_viewed' THEN visitor_id END) as quoter,
      COUNT(DISTINCT CASE WHEN event_type = 'quote_started' THEN visitor_id END) as started,
      COUNT(DISTINCT CASE WHEN event_type = 'quote_step_2' THEN visitor_id END) as step2,
      COUNT(DISTINCT CASE WHEN event_type = 'price_revealed' THEN visitor_id END) as revealed,
      COUNT(DISTINCT CASE WHEN event_type = 'quote_submitted' THEN visitor_id END) as submitted
    FROM web_visits
    WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
      AND event_type IN (
        'landing_page_view',
        'quoter_viewed',
        'quote_started',
        'quote_step_2',
        'price_revealed',
        'quote_submitted'
      )
  )
  SELECT 
    'Landing Page'::TEXT,
    landing,
    100.0::NUMERIC,
    landing - quoter,
    CASE WHEN landing > 0 THEN ROUND(((landing - quoter)::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END
  FROM funnel_data
  UNION ALL
  SELECT 
    'Quoter Viewed'::TEXT,
    quoter,
    CASE WHEN landing > 0 THEN ROUND((quoter::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END,
    quoter - started,
    CASE WHEN quoter > 0 THEN ROUND(((quoter - started)::NUMERIC / quoter::NUMERIC) * 100, 2) ELSE 0 END
  FROM funnel_data
  UNION ALL
  SELECT 
    'Quote Started'::TEXT,
    started,
    CASE WHEN landing > 0 THEN ROUND((started::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END,
    started - step2,
    CASE WHEN started > 0 THEN ROUND(((started - step2)::NUMERIC / started::NUMERIC) * 100, 2) ELSE 0 END
  FROM funnel_data
  UNION ALL
  SELECT 
    'Step 2 (Datos)'::TEXT,
    step2,
    CASE WHEN landing > 0 THEN ROUND((step2::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END,
    step2 - revealed,
    CASE WHEN step2 > 0 THEN ROUND(((step2 - revealed)::NUMERIC / step2::NUMERIC) * 100, 2) ELSE 0 END
  FROM funnel_data
  UNION ALL
  SELECT 
    'Price Revealed'::TEXT,
    revealed,
    CASE WHEN landing > 0 THEN ROUND((revealed::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END,
    revealed - submitted,
    CASE WHEN revealed > 0 THEN ROUND(((revealed - submitted)::NUMERIC / revealed::NUMERIC) * 100, 2) ELSE 0 END
  FROM funnel_data
  UNION ALL
  SELECT 
    'Quote Submitted'::TEXT,
    submitted,
    CASE WHEN landing > 0 THEN ROUND((submitted::NUMERIC / landing::NUMERIC) * 100, 2) ELSE 0 END,
    0::BIGINT,
    0.0::NUMERIC
  FROM funnel_data;
END;
$$ LANGUAGE plpgsql;
