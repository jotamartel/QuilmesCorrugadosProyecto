-- "Enviando" es un estado propio, distinto de "falló".
--
-- POR QUE
--
-- El motor reservaba la fila con resultado='error' y motivo='enviando' antes
-- de llamar a Meta. Sonaba razonable —si el proceso muere, queda como error y
-- es reintentable— pero deja un agujero que se reprodujo ejecutándolo:
--
--   A inserta la reserva y llama a Meta.
--   B llega mientras A está en vuelo, choca el UNIQUE, lee la fila, ve
--     resultado='error' y concluye que el intento anterior falló.
--   B llama a Meta también.
--
-- Resultado: UNA fila en la tabla y DOS WhatsApp en el teléfono del cliente.
-- El UNIQUE protegía el registro, no el envío. La única manera de que el
-- segundo sepa que no tiene que mandar es que "en vuelo" y "falló" sean
-- estados distintos.
--
-- El cooldown de la app usa updated_at: una fila 'enviando' fresca es un envío
-- en curso; una vieja es un proceso que murió a mitad de camino y se puede
-- retomar.

ALTER TABLE public.order_notifications
  DROP CONSTRAINT IF EXISTS order_notifications_resultado_check;

ALTER TABLE public.order_notifications
  ADD CONSTRAINT order_notifications_resultado_check
  CHECK (resultado IN ('enviando', 'enviada', 'sin_soporte', 'error', 'omitida'));

COMMENT ON COLUMN public.order_notifications.resultado IS
  'enviando = reservado, llamada a Meta en curso. enviada = salió. error/sin_soporte = no salió, reintentable. omitida = no correspondía (sin WhatsApp, opt-out, sin alias).';
