-- ============================================================================
-- 021 — Quitar las policies permisivas que anulan el RLS
-- ============================================================================
-- La 020 activo RLS, pero cinco tablas de Quilmes tenian una policy
-- "Allow all ..." con cmd=ALL y qual=true para el rol `public`. Como `public`
-- incluye a `anon`, esa policy le da lectura Y escritura a cualquiera que tenga
-- la clave publica: activar RLS sobre ellas no cambiaba nada.
--
-- Verificado contra produccion el 2026-08-15: con RLS activo y estas policies
-- puestas, la anon key seguia leyendo payments (2 filas) y checks (2 filas).
--
-- Al borrarlas, las tablas quedan sin ninguna policy => RLS deniega todo a
-- anon y authenticated. El service role sigue pasando por encima, que es como
-- accede toda la app (createAdminClient en las rutas de API).
--
-- NO se tocan las policies de los otros proyectos que comparten la instancia
-- (casamejor_*, flows, runs, monitor_runs, melt_monitor_runs, shopify_*,
-- organizations, projects, users...): son suyas y su criterio.
-- ============================================================================

DROP POLICY IF EXISTS "Allow all on payments"          ON public.payments;
DROP POLICY IF EXISTS "Allow all on checks"            ON public.checks;
DROP POLICY IF EXISTS "Allow all on system_config"     ON public.system_config;
DROP POLICY IF EXISTS "Allow all on integration_logs"  ON public.integration_logs;
DROP POLICY IF EXISTS "Allow all on vehicles"          ON public.vehicles;
