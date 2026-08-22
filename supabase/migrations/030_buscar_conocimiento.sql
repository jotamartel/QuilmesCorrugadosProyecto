-- Buscar en lo que el equipo ya respondió.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA QUERY DESDE LA APLICACIÓN
--
-- Porque la consulta no es un select: arma una tsquery a partir de la pregunta
-- del cliente y combina dos rankings distintos. Escrita desde el cliente de
-- Supabase terminaría siendo SQL crudo dentro de un string de TypeScript, lejos
-- de los índices que la sostienen y sin forma de probarla sola.
--
-- POR QUÉ "O" Y NO "Y"
--
-- plainto_tsquery() exige TODAS las palabras. Con eso, "se puede pagar con
-- tarjeta" no encontraba "aceptan tarjeta de crédito", que es exactamente la
-- misma pregunta: alcanza con que sobre una palabra para que no matchee nada.
-- Acá se arma la consulta con OR entre los lexemas y se ordena por ranking, que
-- es lo que hace que "tarjeta" pese aunque el resto de la frase no coincida.
--
-- El costo de OR es que matchea de más: una pregunta sobre "cajas" va a traer
-- cualquier cosa que hable de cajas. Por eso esto NO decide, propone: devuelve
-- hasta tres candidatas con su puntaje y quien las lee —el asistente— decide si
-- alguna responde de verdad lo que preguntaron. Un umbral solo no distingue
-- "¿hacen cajas con ventana?" de "¿hacen cajas para mudanza?", y contestar la
-- que no es, con seguridad, es peor que decir que no sabemos.

CREATE OR REPLACE FUNCTION buscar_conocimiento(consulta text, limite integer DEFAULT 3)
RETURNS TABLE (
  id uuid,
  pregunta text,
  respuesta text,
  puntaje real,
  parecido real
)
LANGUAGE sql
STABLE
-- search_path fijo: sin esto, una funcion SECURITY DEFINER o una llamada desde
-- otro esquema puede resolver `similarity` a algo que no es el de pg_trgm.
SET search_path = public, pg_catalog
AS $$
  WITH consulta_tsq AS (
    SELECT to_tsquery(
      'spanish',
      nullif(string_agg(lexeme, ' | '), '')
    ) AS tsq
    FROM unnest(to_tsvector('spanish', consulta))
  )
  SELECT
    b.id,
    b.pregunta,
    b.respuesta,
    ts_rank(
      to_tsvector('spanish', b.pregunta || ' ' || coalesce(b.respuesta, '')),
      c.tsq
    )::real AS puntaje,
    similarity(b.pregunta, consulta)::real AS parecido
  FROM base_de_conocimiento b, consulta_tsq c
  WHERE b.estado = 'respondida'
    AND b.respuesta IS NOT NULL
    AND (
      (c.tsq IS NOT NULL AND to_tsvector('spanish', b.pregunta || ' ' || coalesce(b.respuesta, '')) @@ c.tsq)
      OR similarity(b.pregunta, consulta) > 0.25
    )
  ORDER BY puntaje DESC, parecido DESC
  LIMIT greatest(1, least(limite, 10));
$$;

COMMENT ON FUNCTION buscar_conocimiento IS
  'Devuelve hasta N respuestas del equipo parecidas a la consulta. PROPONE, no decide: quien la llama tiene que juzgar si alguna responde de verdad.';

-- Y la de al lado: ¿esta pregunta ya está en la lista de pendientes?
--
-- Sirve para no llenar al equipo con doce filas de la misma consulta. Cuando
-- coincide se suma a `veces_preguntada`, que es justamente el dato que ordena la
-- lista: lo que se pregunta seguido vale más que lo que se preguntó una vez.
--
-- Acá el umbral SÍ decide, sin nadie que revise, así que es alto (0.45 de
-- trigramas): equivocarse de más junta dos preguntas distintas en una y el
-- equipo responde una sola creyendo que respondió las dos. Equivocarse de menos
-- solo deja dos filas parecidas, que es barato.
CREATE OR REPLACE FUNCTION buscar_pregunta_pendiente(consulta text)
RETURNS TABLE (id uuid, pregunta text, parecido real)
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT b.id, b.pregunta, similarity(b.pregunta, consulta)::real AS parecido
  FROM base_de_conocimiento b
  WHERE b.estado = 'pendiente'
    AND similarity(b.pregunta, consulta) > 0.45
  ORDER BY parecido DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION buscar_pregunta_pendiente IS
  'Una pregunta pendiente muy parecida a la consulta, para sumarle veces_preguntada en vez de duplicar la fila.';
