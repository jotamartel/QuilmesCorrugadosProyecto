-- Marca de origen del pedido, en la orden y no en el join (etapa 5: punto 11).
--
-- POR QUE UNA COLUMNA Y NO EL JOIN A quotes.channel
--
-- Hoy el canal se deduce joineando orders.quote_id -> quotes.channel. La etapa
-- 5 crea ordenes SIN cotizacion (los pedidos que entran por telefono o
-- mostrador): en cuanto exista la primera, el join devuelve null y la marca se
-- pierde. Ademas nadie filtra hoy por quotes.channel para ordenes (verificado
-- por grep), asi que la columna es aditiva pura.
--
-- El default 'manual' cubre exactamente el caso nuevo: una orden cargada a
-- mano. Las que nacen por convert heredan el canal de su quote (cambio de
-- codigo de la etapa 5; sin el, todo convert nuevo caeria en 'manual').

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'manual'
  CHECK (channel IN ('manual', 'whatsapp', 'email', 'web'));

-- Backfill: las ordenes existentes tienen todas quote_id, su canal real es el
-- de la quote. Distribucion esperada al 2026-08-23: 4 manual, 3 web.
UPDATE orders o
SET    channel = q.channel
FROM   quotes q
WHERE  o.quote_id = q.id
  AND  q.channel IN ('manual', 'whatsapp', 'email', 'web');

-- Registra si el precio salio del motor o lo escribio el vendedor (pedido
-- negociado). Solo para auditar: no interviene en ningun calculo. La
-- geometria (m², plancha) SIEMPRE la calcula el motor, en los dos modos.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'motor'
  CHECK (pricing_mode IN ('motor', 'manual'));

COMMENT ON COLUMN orders.channel IS
  'Origen del pedido. Heredado de quotes.channel en el convert; manual para ordenes cargadas desde el panel.';
COMMENT ON COLUMN orders.pricing_mode IS
  'motor = precio de calcularCotizacion(); manual = precio negociado escrito por el vendedor.';

CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
