import type Groq from 'groq-sdk';

/**
 * Los modelos de Groq, en un solo lugar y con caída en cascada.
 *
 * POR QUE EXISTE
 *
 * El chat del sitio estuvo devolviendo "Hubo un error" durante días. La causa:
 * Groq retiró toda la línea Llama 3.x y los dos IDs que el código pedía
 * —llama-3.3-70b-versatile y llama-3.1-8b-instant— pasaron a devolver 404
 * model_not_found. Estaban escritos a mano en cinco lugares de dos archivos.
 *
 * Lo caro no fue que se rompiera: fue que el "fallback" era el otro modelo de
 * la misma familia retirada. Cuando cayó el primero cayeron los dos, y como el
 * catch de más arriba devuelve un texto amable, desde afuera parecía que el
 * chat andaba y contestaba mal, en vez de estar caído.
 *
 * Peor: la misma familia la usaba classifyIntent para el bot de WhatsApp. O
 * sea que la capa de IA del bot no estaba de respaldo de los regex: estaba
 * muerta, y los regex eran lo único que corría.
 *
 * Por eso acá la lista es una CASCADA, no un par. Un 404 de modelo pasa al
 * siguiente y se loguea distinto de cualquier otro error, para que la próxima
 * baja se vea en los logs en vez de disolverse en un mensaje de disculpas.
 *
 * OJO CON max_tokens: varios de estos modelos razonan antes de responder y ese
 * razonamiento consume del mismo presupuesto. Con max_tokens bajo devuelven
 * cadena vacía y finish_reason "length", sin error. Medido: gpt-oss-20b con 50
 * tokens devuelve vacío; los compound contestan igual. Por eso los compound van
 * primero y hay un piso de tokens más abajo.
 */

/** Conversación: respuestas al cliente, en castellano rioplatense. */
export const MODELOS_CONVERSACION = [
  'groq/compound',
  'groq/compound-mini',
  'openai/gpt-oss-120b',
] as const;

/** Clasificación: JSON corto, tiene que ser barato y rápido. */
export const MODELOS_CLASIFICACION = [
  'groq/compound-mini',
  'groq/compound',
  'openai/gpt-oss-20b',
] as const;

/**
 * Piso de presupuesto. Un modelo que razona necesita margen para razonar Y
 * responder; por debajo de esto devuelve vacío sin avisar.
 */
const MIN_TOKENS = 300;

function esModeloInexistente(error: unknown): boolean {
  const e = error as { status?: number; error?: { error?: { code?: string } } };
  if (e?.status !== 404) return false;
  const code = e?.error?.error?.code;
  return code === 'model_not_found' || code === undefined;
}

/**
 * Los tipos se derivan de la firma del propio método en vez de nombrarlos.
 * El SDK los cuelga de un namespace que no es alcanzable desde el import por
 * defecto, y los nombres cambian entre versiones; esto no se rompe con eso.
 */
type CrearParams = Parameters<Groq['chat']['completions']['create']>[0];
type Respuesta = Awaited<ReturnType<Groq['chat']['completions']['create']>>;

/** Todo lo que se le pasa a Groq menos el modelo, que lo elige la cascada. */
type Opciones = Omit<CrearParams, 'model' | 'stream'>;

/**
 * Pide una respuesta recorriendo la lista hasta que un modelo conteste.
 *
 * Solo cae al siguiente cuando el modelo no existe. Cualquier otro error
 * —sin crédito, rate limit, red— se propaga: reintentar con otro modelo no lo
 * arregla y esconde el problema real.
 */
export async function completarConCascada(
  groq: Groq,
  opciones: Opciones,
  modelos: readonly string[],
  etiqueta: string,
): Promise<Extract<Respuesta, { choices: unknown }>> {
  const retirados: string[] = [];

  for (const model of modelos) {
    try {
      const respuesta = await groq.chat.completions.create({
        ...opciones,
        model,
        stream: false,
        max_tokens: Math.max(opciones.max_tokens ?? MIN_TOKENS, MIN_TOKENS),
      } as CrearParams);
      return respuesta as Extract<Respuesta, { choices: unknown }>;
    } catch (error) {
      if (!esModeloInexistente(error)) throw error;
      retirados.push(model);
      console.error(
        `[${etiqueta}] El modelo "${model}" ya no existe en Groq. ` +
          `Probando el siguiente de la cascada. Actualizar groq-modelos.ts.`,
      );
    }
  }

  throw new Error(
    `[${etiqueta}] Ningún modelo de la cascada existe en Groq: ${retirados.join(', ')}. ` +
      `Revisar https://console.groq.com/docs/models y actualizar groq-modelos.ts.`,
  );
}
