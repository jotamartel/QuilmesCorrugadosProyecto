-- El traspaso de una conversación de WhatsApp del asistente a una persona.
--
-- QUÉ ESTABA ROTO
--
-- Cuando alguien pedía hablar con una persona, el asistente le pasaba un link
-- de WhatsApp y ahí terminaba su participación. No se avisaba a nadie: la
-- notificación por Telegram existía, pero vivía en la máquina de estados vieja,
-- y el asistente corta antes de llegar a ese código. Si el cliente no escribía
-- por su cuenta, el pedido de atención humana se perdía sin dejar rastro.
--
-- Y al revés: si alguien del equipo empezaba a atender esa conversación desde
-- el celular, el asistente seguía contestando igual, encima de la persona. El
-- webhook nunca consultaba `attended`, así que marcar una conversación como
-- atendida en el panel no callaba al bot.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO `attended`
--
-- `attended` ya existe pero significa otra cosa: es una marca de repaso, la
-- pone alguien desde el panel para llevar la cuenta de qué revisó. Reusarla
-- callaría al asistente en todas las conversaciones viejas que alguna vez se
-- marcaron, que no es lo que se quiere.
--
-- POR QUÉ ES UNA FECHA Y NO UN BOOLEANO
--
-- Un booleano se queda prendido. Alguien pausa el bot para atender, se olvida
-- de devolvérselo, y esa línea queda muda para siempre sin que nadie se entere
-- —el modo de falla más caro, porque no hace ruido—. Con una fecha, la pausa
-- vence sola: si nadie contesta, el asistente vuelve a atender y por lo menos
-- el cliente recibe algo.

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS bot_pausado_hasta timestamptz;

COMMENT ON COLUMN whatsapp_conversations.bot_pausado_hasta IS
  'Hasta cuándo el asistente NO debe responder esta conversación, porque la está atendiendo una persona. Null o pasado = el asistente atiende. Vence sola para que una pausa olvidada no deje la línea muda.';

-- Para la consulta del webhook, que corre en cada mensaje entrante.
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_pausa
  ON whatsapp_conversations (phone_number, bot_pausado_hasta);
