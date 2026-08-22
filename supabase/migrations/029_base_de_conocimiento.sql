-- Lo que el asistente no supo contestar, y lo que el equipo respondió.
--
-- POR QUÉ
--
-- Hasta ahora, cuando alguien preguntaba algo fuera de lo que el asistente
-- sabe —si aceptan tarjeta, si entregan un sábado, si hacen cajas con ventana—
-- la respuesta era pasarle el link de WhatsApp para que lo preguntara de nuevo,
-- a mano, del otro lado. Nadie se enteraba de que la pregunta existió, así que
-- la misma consulta se perdía todas las veces.
--
-- Esta tabla hace dos cosas. Primero, deja registro: el equipo ve qué le están
-- preguntando y cuántas veces. Y segundo, cuando alguien escribe la respuesta,
-- el asistente la usa la próxima vez.
--
-- LA PARTE DELICADA: RESPONDER NO ES ENSEÑAR
--
-- `respuesta` NO se llena sola con lo que el vendedor le contestó al cliente.
-- Una respuesta real es casi siempre particular —"sí, para el jueves lo tenés",
-- "te hago 1.100 el metro"— y guardarla como conocimiento general haría que el
-- asistente se lo prometa al próximo. Por eso son dos pasos: contestarle a la
-- persona es uno, y decidir que esa respuesta sirve para el futuro es otro,
-- explícito, con el texto editable antes de guardarlo.
--
-- Es más trabajo para el equipo y es a propósito. Un asistente que aprende solo
-- de cada conversación empieza a afirmar cosas que nadie reviso, en el canal por
-- el que entra la mayoría de las consultas.

CREATE TABLE IF NOT EXISTS base_de_conocimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- La pregunta tal como la escribió el cliente. Sin limpiar: el equipo tiene
  -- que leer lo que realmente le preguntaron, con sus palabras.
  pregunta text NOT NULL,

  -- Qué estaba pasando cuando pregunto: si ya había cotizado, qué medida, etc.
  -- Lo escribe el asistente para que quien responda no tenga que reconstruirlo.
  contexto text,

  canal text NOT NULL CHECK (canal IN ('web', 'whatsapp', 'email', 'api')),
  telefono text,

  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'respondida', 'descartada')),

  -- La respuesta REUTILIZABLE, escrita por una persona. Null mientras nadie la
  -- haya escrito. Ver el comentario de arriba sobre por qué no se llena sola.
  respuesta text,
  respondida_por text,
  respondida_en timestamptz,

  -- Cuántas veces preguntaron lo mismo. Es lo que ordena la lista: la pregunta
  -- que se repite doce veces vale más que la que se hizo una.
  veces_preguntada integer NOT NULL DEFAULT 1,
  ultima_vez timestamptz NOT NULL DEFAULT now(),
  creada_en timestamptz NOT NULL DEFAULT now()
);

-- Para buscar en español, con las tildes normalizadas: quien escribe por
-- WhatsApp pone "cuanto" y "envio" sin tilde la mitad de las veces.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- La columna de búsqueda combina pregunta y respuesta: alguien puede preguntar
-- con otras palabras que las de la pregunta original pero coincidir con las de
-- la respuesta.
--
-- unaccent() no es IMMUTABLE por defecto —depende del diccionario— así que no
-- se puede usar en una columna generada. Se resuelve con un índice de
-- expresión sobre to_tsvector('spanish', ...), que ya hace su propio stemming
-- y trata bien la mayoría de los acentos del castellano.
CREATE INDEX IF NOT EXISTS idx_conocimiento_busqueda
  ON base_de_conocimiento
  USING gin (to_tsvector('spanish', pregunta || ' ' || coalesce(respuesta, '')));

-- Y trigramas sobre la pregunta, para las que llegan con errores de tipeo o
-- muy cortas, donde el stemming no alcanza.
CREATE INDEX IF NOT EXISTS idx_conocimiento_trigramas
  ON base_de_conocimiento USING gin (pregunta gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_conocimiento_pendientes
  ON base_de_conocimiento (estado, veces_preguntada DESC, ultima_vez DESC);

-- RLS prendido y sin policies: escribe la service role del asistente y lee el
-- panel, que va con sesion. Sin esto queda legible con la clave anonima —que es
-- publica— y expone las preguntas de los clientes con su telefono.
ALTER TABLE base_de_conocimiento ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE base_de_conocimiento IS
  'Preguntas que el asistente no supo contestar y las respuestas reutilizables que escribio el equipo. Ver src/lib/conocimiento.ts';
COMMENT ON COLUMN base_de_conocimiento.respuesta IS
  'Respuesta GENERAL, escrita a mano por una persona. No se llena automaticamente con lo que se le contesto a un cliente: eso suele ser particular de ese pedido.';
