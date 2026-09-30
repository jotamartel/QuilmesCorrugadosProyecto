-- Nombres en la lista de chats de WhatsApp del panel.
--
-- La lista mostraba solo teléfonos. Florencia: "estoy hablando con una
-- persona y después caen varias consultas y tengo que entrar a cada chat para
-- identificar con quién estaba hablando". De 72 conversaciones, 13 tenían un
-- nombre conocido (el que el cliente le dijo al bot, en contact_profiles).
--
--   nombre_perfil   el que la persona tiene en su perfil de WhatsApp. Meta lo
--                   manda con cada mensaje y hasta ahora se tiraba. Se pisa
--                   con cada mensaje, por si lo cambia.
--   nombre_panel    el que pone Florencia a mano desde el panel ("Hernán -
--                   ventiladores"). Manda sobre los demás y nunca lo pisa el
--                   sistema.

alter table public.whatsapp_conversations
  add column if not exists nombre_perfil text,
  add column if not exists nombre_panel text;
