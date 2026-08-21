-- Idempotencia del webhook de WhatsApp.
--
-- POR QUÉ
--
-- Los proveedores reintentan. Meta reintenta si el webhook no contesta 200 a
-- tiempo o si contesta un 5xx, y el handler hace una llamada a un modelo en el
-- medio, que tarda segundos: no es un caso teórico. Cada reintento volvía a
-- correr el flujo entero, o sea: se guardaba el mensaje entrante dos veces, se
-- creaba el lead dos veces, se avanzaba la máquina de estados dos veces —lo que
-- puede saltear un paso— y, lo que ve el cliente, se le contestaba dos veces.
--
-- Esta tabla es la marca de "este mensaje ya lo estoy atendiendo".
--
-- POR QUÉ HAY DOS FECHAS Y NO UN BOOLEANO
--
-- `recibido_en` es cuándo se tomó el mensaje; `completado_en`, cuándo se terminó
-- de atender. La diferencia importa para el caso feo: si el proceso se muere a
-- mitad —timeout de la función, por ejemplo—, la marca queda puesta y nunca se
-- completa. Con un booleano de "visto", el reintento se descartaría y el cliente
-- se quedaría sin respuesta, en silencio. Con las dos fechas, un reintento que
-- llega y encuentra una marca vieja sin completar sabe que el primer intento no
-- llegó a ningún lado y lo vuelve a tomar.
--
-- De los dos errores posibles, contestar dos veces es incómodo pero visible;
-- no contestar es una venta perdida que nadie se entera.

CREATE TABLE IF NOT EXISTS whatsapp_mensajes_procesados (
  -- El id que le puso el proveedor al mensaje: MessageSid en Twilio, wamid en
  -- Meta. Es la clave primaria: dos inserts del mismo id no pueden convivir, y
  -- de eso depende que dos reintentos simultáneos no pasen los dos.
  id            text PRIMARY KEY,
  proveedor     text NOT NULL,
  telefono      text NOT NULL,
  recibido_en   timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz
);

-- Para poder limpiar lo viejo sin recorrer la tabla entera. Esto crece con cada
-- mensaje que entra y no se borra solo: cuando moleste, un DELETE de lo anterior
-- a hace una semana alcanza. No se borra automáticamente porque durante los
-- primeros días de Meta esta tabla es el registro de qué llegó y qué no.
CREATE INDEX IF NOT EXISTS idx_wa_procesados_recibido
  ON whatsapp_mensajes_procesados (recibido_en);

-- RLS prendido y SIN policies, a propósito: la única que escribe acá es la
-- service role del webhook, que saltea RLS. Sin esto, la tabla queda legible con
-- la clave anónima —que es pública, va en el navegador— y expone los teléfonos
-- de todos los que escribieron.
ALTER TABLE whatsapp_mensajes_procesados ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_mensajes_procesados IS
  'Marca de mensajes de WhatsApp ya atendidos, para que un reintento del proveedor no vuelva a correr el flujo. Ver src/lib/whatsapp-idempotencia.ts';
