-- Las conversaciones del chat del sitio.
--
-- POR QUE EXISTEN, Y POR QUE APARTE DE LAS DE WHATSAPP
--
-- Hasta ahora el chat del sitio no guardaba nada: el endpoint recibía el
-- mensaje, llamaba al agente y devolvía la respuesta. El historial vivía en el
-- navegador del visitante y se iba al cerrar la pestaña. Llegó una consulta
-- real —"Cajas Navideñas, trabajan?"— que el asistente no supo contestar, y
-- cuando el equipo fue a buscarla no había nada: ni la conversación, ni con qué
-- entender qué se había hablado.
--
-- Van en sus propias tablas y no mezcladas con WhatsApp porque son cosas
-- distintas, y la diferencia importa todos los días:
--
--   WhatsApp   la identidad es el teléfono, la conversación sigue en el
--              tiempo, y el equipo PUEDE contestar desde el panel.
--   El sitio   el visitante es anónimo, la sesión dura lo que dura la
--              pestaña, y NO hay a quién contestarle salvo que deje un dato.
--
-- Mezclarlas llenaría la bandeja de WhatsApp —que existe para atender— de
-- conversaciones que no se pueden atender. La lista de pendientes dejaría de
-- ser una lista de pendientes.

create table if not exists public.chat_web_conversaciones (
  id uuid primary key default gen_random_uuid(),

  -- El id que genera el navegador y guarda en localStorage. Es lo único que
  -- permite agrupar mensajes de una misma persona: no hay login ni teléfono.
  -- Si borra los datos del sitio, empieza una conversación nueva, y está bien:
  -- para nosotros es otra visita.
  sesion text not null unique,

  -- Desde qué página abrió el chat. Preguntar desde /precios no es lo mismo
  -- que preguntar desde /cajas-mudanza.
  pagina_inicial text,

  cantidad_mensajes integer not null default 0,

  -- Si alguna vez deja un mail o un teléfono, va acá. Es lo que convierte una
  -- consulta perdida en una que se puede responder.
  contacto text,

  -- Las dos marcas que hacen que valga la pena abrir la conversación: algo que
  -- el asistente no supo, o alguien que pidió hablar con una persona.
  hubo_pregunta_sin_respuesta boolean not null default false,
  pidio_humano boolean not null default false,

  creada_en timestamptz not null default now(),
  ultima_en timestamptz not null default now()
);

create table if not exists public.chat_web_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null
    references public.chat_web_conversaciones(id) on delete cascade,
  rol text not null check (rol in ('visitante', 'asistente')),
  contenido text not null,
  -- En qué página estaba al escribir ESTE mensaje: se navega mientras se
  -- conversa, y saber dónde estaba cuando preguntó algo explica la pregunta.
  pagina text,
  creado_en timestamptz not null default now()
);

-- La lista del panel ordena por actividad y filtra por las dos marcas.
create index if not exists chat_web_conversaciones_ultima_idx
  on public.chat_web_conversaciones (ultima_en desc);
create index if not exists chat_web_conversaciones_atencion_idx
  on public.chat_web_conversaciones (ultima_en desc)
  where hubo_pregunta_sin_respuesta or pidio_humano;

create index if not exists chat_web_mensajes_conversacion_idx
  on public.chat_web_mensajes (conversacion_id, creado_en);

-- RLS prendido con cero policies, patrón de la casa: nada se lee con el
-- cliente de sesión. El endpoint público escribe con service_role y el panel
-- lee con service_role detrás de la compuerta.
alter table public.chat_web_conversaciones enable row level security;
alter table public.chat_web_mensajes enable row level security;

comment on table public.chat_web_conversaciones is
  'Conversaciones del chat del sitio. Aparte de WhatsApp a propósito: acá el visitante es anónimo y no se le puede contestar.';
comment on column public.chat_web_conversaciones.sesion is
  'Id generado por el navegador. Si borra los datos del sitio, arranca una conversación nueva.';
