-- ============================================================================
-- 020 — Activar Row Level Security
-- ============================================================================
-- CONTEXTO (verificado contra produccion el 2026-08-15):
--
-- RLS estaba DESACTIVADO en todas las tablas de la aplicacion. Como la anon key
-- viaja en el bundle del browser (NEXT_PUBLIC_SUPABASE_ANON_KEY), cualquier
-- visitante del sitio podia extraerla y, contra la API REST de Supabase:
--
--   * LEER  public_quotes (183 filas con nombre, email, telefono, CUIT,
--           direccion y coordenadas de entrega), clients, orders, quotes,
--           payments, communications, checks, web_visits, active_sessions.
--   * ESCRIBIR: UPDATE y DELETE aceptados (HTTP 204) sobre public_quotes,
--           boxes, pricing_config, clients y orders. Es decir: borrar
--           cotizaciones, cambiar precios o poner el stock en cero.
--
-- POR QUE ESTO ES EL FIX CORRECTO:
-- Rotar la anon key NO resuelve nada: esa clave esta pensada para ser publica.
-- El limite de seguridad real en Supabase es RLS.
--
-- POR QUE NO ROMPE LA APP:
-- Todo el acceso a datos pasa por rutas de API que usan createAdminClient()
-- (service role), y el service role ignora RLS por diseño. El cliente de
-- browser (src/lib/supabase/client.ts) no lo importa ningun archivo.
-- Verificado con grep sobre todo src/.
--
-- Sin policies, RLS deniega todo a anon y authenticated. Ese es el default
-- deseado: si mas adelante alguna pantalla necesita leer desde el browser, se
-- agrega una policy explicita para ese caso puntual.
--
-- ALCANCE: solo tablas de Quilmes Corrugados. Esta instancia de Supabase la
-- comparten otros proyectos (casamejor_*, flows, runs, monitor_runs,
-- shopify_connections, recording_sessions, validation_jobs, organizations,
-- org_members, projects, users, incidents) que podrian estar usando la anon
-- key con RLS apagado. Tocarlas romperia esas apps: quedan fuera a proposito.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tablas TEXT[] := ARRAY[
    -- Canal publico y minorista
    'public_quotes', 'boxes', 'pricing_config', 'buenos_aires_cities',
    'delivery_routes', 'vehicles',
    -- Nucleo comercial
    'clients', 'quotes', 'quote_items', 'quote_sequence',
    'orders', 'order_items', 'order_sequence', 'order_costs',
    'payments', 'checks', 'transferencias',
    -- Costos
    'cost_categories', 'fixed_costs', 'operational_expenses',
    'production_cost_config', 'supplies', 'supply_price_history',
    -- Omnicanalidad y tracking
    'contact_profiles', 'communications', 'whatsapp_conversations',
    'llamadas', 'web_visits', 'active_sessions',
    -- Infra interna
    'api_keys', 'api_requests', 'authorized_users', 'system_config',
    'integration_logs', 'company_enrichments', 'printing_designs'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS activado en %', t;
    ELSE
      RAISE NOTICE 'tabla % no existe, se saltea', t;
    END IF;
  END LOOP;
END $$;
