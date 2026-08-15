-- ============================================================================
-- 019 — Esquema del canal minorista (retail)
-- ============================================================================
-- Todo lo que hay acá YA EXISTE en la base productiva: se aplicó a mano sobre
-- Supabase y nunca llegó a las migraciones. Esta migración lo codifica para que
-- un entorno nuevo (o un `db reset`) levante igual que producción, que hasta
-- ahora fallaba.
--
-- Es idempotente por diseño (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT
-- EXISTS / bloques guardados): contra la base actual es un no-op.
--
-- Relevado columna por columna contra producción el 2026-08-15 con
-- format_type() y pg_constraint, no a partir de las migraciones previas.
--
-- NO incluye, deliberadamente:
--   * El fix de public_quotes_source_check (hoy sólo acepta 'web' y 'whatsapp'
--     mientras que `canal` sí acepta 'telefono'). Eso es un cambio de
--     comportamiento, no codificar lo existente: va en una migración aparte.
--   * Las tablas de otros proyectos que comparten esta instancia de Supabase
--     (casamejor_*, flows, runs, monitor_runs, shopify_connections, etc.).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Stock de cajas estándar
-- ---------------------------------------------------------------------------
-- El diferencial del canal minorista es la entrega inmediata desde stock, así
-- que este número decide qué medidas se pueden ofrecer con promesa de entrega.

ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN boxes.stock IS
  'Unidades en deposito. Se carga a mano desde el dashboard (/catalogo). Solo debe descontarse ante una venta confirmada, nunca al cotizar.';


-- ---------------------------------------------------------------------------
-- 2. Precio minorista
-- ---------------------------------------------------------------------------

ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS price_per_m2_retail NUMERIC NOT NULL DEFAULT 900;

COMMENT ON COLUMN pricing_config.price_per_m2_retail IS
  'ARS por m2 para pedidos minoristas (< 1000 m2). Por encima de ese umbral aplica el precio mayorista.';


-- ---------------------------------------------------------------------------
-- 3. Rutas de reparto
-- ---------------------------------------------------------------------------
-- Depende de vehicles, creada en 003_xubio_arba_integration.sql.

CREATE TABLE IF NOT EXISTS delivery_routes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_date                  DATE NOT NULL,
  vehicle_id                  UUID REFERENCES vehicles(id),
  driver_token                TEXT NOT NULL UNIQUE,
  status                      TEXT DEFAULT 'planned'
    CHECK (status IN ('planned', 'dispatched', 'in_progress', 'completed', 'cancelled')),
  total_stops                 INTEGER DEFAULT 0,
  completed_stops             INTEGER DEFAULT 0,
  failed_stops                INTEGER DEFAULT 0,
  optimized_waypoint_order    INTEGER[],
  route_polyline              TEXT,
  estimated_duration_minutes  INTEGER,
  estimated_distance_km       NUMERIC(8,2),
  started_at                  TIMESTAMPTZ,
  completed_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_date  ON delivery_routes (route_date);
CREATE INDEX IF NOT EXISTS idx_dr_token ON delivery_routes (driver_token);


-- ---------------------------------------------------------------------------
-- 4. Fulfillment y envío en public_quotes
-- ---------------------------------------------------------------------------

ALTER TABLE public_quotes
  ADD COLUMN IF NOT EXISTS fulfillment_status     TEXT DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS shipping_method        TEXT,
  ADD COLUMN IF NOT EXISTS shipping_cost          NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_lat           NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng           NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS delivery_date          DATE,
  ADD COLUMN IF NOT EXISTS delivery_sequence      INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_route_id      UUID,
  ADD COLUMN IF NOT EXISTS dispatched_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_notes           TEXT,
  ADD COLUMN IF NOT EXISTS failed_delivery_reason TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_date        DATE;

COMMENT ON COLUMN public_quotes.fulfillment_status IS
  'Estado logistico del pedido, independiente de `status` (que es el estado comercial de la cotizacion).';
COMMENT ON COLUMN public_quotes.shipping_method IS
  'retiro_sucursal | envio_caba_amba | envio_resto_pais';

-- ADD CONSTRAINT no admite IF NOT EXISTS, así que se protege con un bloque.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'public_quotes_fulfillment_status_check'
  ) THEN
    ALTER TABLE public_quotes
      ADD CONSTRAINT public_quotes_fulfillment_status_check
      CHECK (fulfillment_status IN (
        'pending_payment', 'paid', 'preparing', 'ready_for_dispatch', 'dispatched',
        'in_transit', 'delivered', 'failed_delivery', 'rescheduled'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_delivery_route'
  ) THEN
    ALTER TABLE public_quotes
      ADD CONSTRAINT fk_delivery_route
      FOREIGN KEY (delivery_route_id) REFERENCES delivery_routes(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pq_fulfillment   ON public_quotes (fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_pq_delivery_date ON public_quotes (delivery_date);
