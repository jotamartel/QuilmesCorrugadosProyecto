-- Fecha de entrega y coordinacion de la entrega (etapa 6: puntos 4 y 9).
--
-- DOS FECHAS DISTINTAS A PROPOSITO
--
-- estimated_delivery (ya existia): la promesa temprana al cliente, se fija al
-- confirmar el pedido y ahora va a ser editable desde el panel.
-- scheduled_delivery_date (nueva): el dia acordado para el flete, se fija
-- cuando la orden esta lista y el saldo cobrado. Son momentos distintos del
-- pedido y confundirlas es prometer con la fecha equivocada.
--
-- La ventana horaria es texto libre porque asi se acuerda por WhatsApp
-- ("manana", "15 a 17hs", "antes del mediodia"): imponer un enum obligaria a
-- mapear cada frase.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS scheduled_delivery_date timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_time_window text;

COMMENT ON COLUMN public.orders.scheduled_delivery_date IS
  'Dia y hora acordados con el cliente para la entrega. Distinto de estimated_delivery (promesa al confirmar).';
COMMENT ON COLUMN public.orders.delivery_time_window IS
  'Ventana horaria libre acordada por WhatsApp (ej: 15hs a 17hs).';

-- La vista de produccion filtra por 3 estados de 7 y ordena por fecha: un
-- indice parcial mantiene el arbol chico.
CREATE INDEX IF NOT EXISTS orders_produccion_por_entrega_idx
  ON public.orders (estimated_delivery ASC NULLS LAST)
  WHERE status IN ('confirmed','in_production','ready');

-- Backfill de las ordenes vivas con estimated_delivery en null (verificado
-- 2026-08-23: OC-2026-0003, 0005 y 0006). La causa: el convert de las
-- cotizaciones web copiaba production_days pero nunca calculaba la fecha.
-- Se rellena con creacion + dias de produccion, en dias CALENDARIO: estas
-- ordenes ya estan vencidas, la fecha es un proxy historico que cierra el
-- null — no una promesa nueva. Fernando puede corregirla desde el detalle.
UPDATE public.orders o
SET    estimated_delivery = (o.created_at::date + COALESCE(q.production_days, 7))
FROM   public.quotes q
WHERE  o.quote_id = q.id
  AND  o.estimated_delivery IS NULL;
