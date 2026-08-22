/**
 * Lo que el asistente no supo contestar, y lo que el equipo respondió.
 *
 * DE QUÉ SE TRATA
 *
 * Antes, una pregunta fuera de lo que el asistente sabe terminaba en un link de
 * WhatsApp para que la persona la volviera a hacer del otro lado. Nadie se
 * enteraba de que la pregunta existió y la próxima vez pasaba lo mismo.
 *
 * Ahora la pregunta queda anotada, alguien del equipo escribe una respuesta, y
 * el asistente la usa la próxima vez.
 *
 * LO QUE NO HACE, A PROPÓSITO
 *
 * No aprende solo de lo que el equipo le contesta a un cliente. Una respuesta
 * real casi siempre es particular —"sí, para el jueves lo tenés", "te hago
 * 1.100 el metro"— y guardarla como conocimiento general haría que el asistente
 * se la prometa al siguiente. Contestarle a alguien y enseñarle al asistente son
 * dos actos distintos, y el segundo pasa por una persona que edita el texto
 * antes de guardarlo.
 *
 * Ver también supabase/migrations/029 y 030.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type CanalDeConsulta = 'web' | 'whatsapp' | 'email' | 'api';

/** Una respuesta del equipo que se parece a lo que preguntaron. */
export interface RespuestaCandidata {
  id: string;
  pregunta: string;
  respuesta: string;
  /** Ranking de texto completo. Alto es mejor, pero no es una probabilidad. */
  puntaje: number;
  /** Parecido de trigramas entre las dos preguntas, de 0 a 1. */
  parecido: number;
}

export interface PreguntaPendiente {
  id: string;
  pregunta: string;
  contexto: string | null;
  canal: CanalDeConsulta;
  telefono: string | null;
  veces_preguntada: number;
  ultima_vez: string;
  creada_en: string;
}

/**
 * Busca respuestas parecidas a lo que preguntaron.
 *
 * DEVUELVE CANDIDATAS, NO UNA RESPUESTA. La búsqueda es léxica: encuentra por
 * palabras, no por significado, así que trae de más. Quien la llama tiene que
 * leer cada candidata y decidir si responde de verdad lo que se preguntó.
 *
 * Conviene pasarle la pregunta MÁS sinónimos: "formas de pago" no encuentra una
 * respuesta que habla de "transferencia y efectivo", pero "formas de pago
 * tarjeta transferencia efectivo" sí. Expandir la consulta es gratis para un
 * modelo que ya está escribiendo la llamada.
 */
export async function buscarConocimiento(
  consulta: string,
  limite = 3,
): Promise<RespuestaCandidata[]> {
  const texto = (consulta || '').trim();
  if (!texto) return [];

  try {
    const { data, error } = await createAdminClient().rpc('buscar_conocimiento', {
      consulta: texto,
      limite,
    });
    if (error) {
      console.error('[conocimiento] no se pudo buscar:', error);
      return [];
    }
    return (data as RespuestaCandidata[]) || [];
  } catch (e) {
    // Nunca romper la conversación por esto: sin resultados el asistente sigue
    // su camino normal, que es preguntar o derivar.
    console.error('[conocimiento] no se pudo buscar:', e);
    return [];
  }
}

/**
 * Anota una pregunta que el asistente no supo contestar.
 *
 * Si ya hay una pendiente muy parecida no crea otra: le suma una a
 * `veces_preguntada`. Esa cuenta es lo que ordena la lista del equipo, así que
 * doce filas iguales son peores que una fila que dice doce.
 *
 * Devuelve si la pregunta es nueva, para que quien llama decida si avisar: no
 * tiene sentido mandar un mail por la misma consulta cada vez que alguien la
 * hace.
 */
export async function anotarPreguntaSinRespuesta(datos: {
  pregunta: string;
  contexto?: string | null;
  canal: CanalDeConsulta;
  telefono?: string | null;
}): Promise<{ id: string | null; esNueva: boolean; vecesPreguntada: number }> {
  const pregunta = (datos.pregunta || '').trim();
  if (!pregunta) return { id: null, esNueva: false, vecesPreguntada: 0 };

  const db = createAdminClient();

  try {
    const { data: parecidas } = await db.rpc('buscar_pregunta_pendiente', {
      consulta: pregunta,
    });
    const yaEsta = (parecidas as Array<{ id: string }> | null)?.[0];

    if (yaEsta) {
      // Se lee y se escribe en dos pasos porque PostgREST no expone un
      // incremento atómico. Dos consultas simultáneas de la misma pregunta
      // pueden dejar la cuenta en uno menos, y no importa: es un número para
      // priorizar una lista, no un saldo.
      const { data: actual } = await db
        .from('base_de_conocimiento')
        .select('veces_preguntada')
        .eq('id', yaEsta.id)
        .maybeSingle();

      const veces = (actual?.veces_preguntada ?? 1) + 1;
      await db
        .from('base_de_conocimiento')
        .update({ veces_preguntada: veces, ultima_vez: new Date().toISOString() })
        .eq('id', yaEsta.id);

      return { id: yaEsta.id, esNueva: false, vecesPreguntada: veces };
    }

    const { data, error } = await db
      .from('base_de_conocimiento')
      .insert({
        pregunta,
        contexto: datos.contexto || null,
        canal: datos.canal,
        telefono: datos.telefono || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[conocimiento] no se pudo anotar la pregunta:', error);
      return { id: null, esNueva: false, vecesPreguntada: 0 };
    }
    return { id: data.id as string, esNueva: true, vecesPreguntada: 1 };
  } catch (e) {
    console.error('[conocimiento] no se pudo anotar la pregunta:', e);
    return { id: null, esNueva: false, vecesPreguntada: 0 };
  }
}

/** Las preguntas sin responder, las más repetidas primero. */
export async function preguntasPendientes(limite = 50): Promise<PreguntaPendiente[]> {
  const { data, error } = await createAdminClient()
    .from('base_de_conocimiento')
    .select('id, pregunta, contexto, canal, telefono, veces_preguntada, ultima_vez, creada_en')
    .eq('estado', 'pendiente')
    .order('veces_preguntada', { ascending: false })
    .order('ultima_vez', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('[conocimiento] no se pudieron leer las pendientes:', error);
    return [];
  }
  return (data as PreguntaPendiente[]) || [];
}

/** Lo ya respondido, para revisarlo o corregirlo desde el panel. */
export async function respuestasDelEquipo(limite = 100) {
  const { data, error } = await createAdminClient()
    .from('base_de_conocimiento')
    .select('id, pregunta, respuesta, respondida_por, respondida_en, veces_preguntada, canal')
    .eq('estado', 'respondida')
    .order('respondida_en', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('[conocimiento] no se pudieron leer las respuestas:', error);
    return [];
  }
  return data || [];
}

/**
 * Guarda la respuesta reutilizable de una pregunta.
 *
 * A partir de acá el asistente la puede usar con cualquier cliente, así que el
 * texto tiene que estar escrito en general y no para la persona que preguntó.
 * Eso lo decide y lo edita quien responde: acá solo se guarda.
 */
export async function responderPregunta(
  id: string,
  respuesta: string,
  quien: string,
): Promise<boolean> {
  const texto = (respuesta || '').trim();
  if (!texto) return false;

  const { error } = await createAdminClient()
    .from('base_de_conocimiento')
    .update({
      respuesta: texto,
      estado: 'respondida',
      respondida_por: quien,
      respondida_en: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('[conocimiento] no se pudo guardar la respuesta:', error);
    return false;
  }
  return true;
}

/**
 * Saca una pregunta de la lista sin responderla.
 *
 * Para lo que no vale la pena enseñarle al asistente: una consulta de una vez,
 * algo mal escrito, o algo que se contesta distinto en cada caso. Se marca en
 * vez de borrarse para que la misma pregunta no vuelva a aparecer mañana como
 * si fuera nueva.
 */
export async function descartarPregunta(id: string, quien: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from('base_de_conocimiento')
    .update({ estado: 'descartada', respondida_por: quien, respondida_en: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[conocimiento] no se pudo descartar:', error);
    return false;
  }
  return true;
}
