/**
 * Que un reintento del proveedor no vuelva a correr el flujo entero.
 *
 * EL PROBLEMA
 *
 * Los proveedores de WhatsApp reintentan. Meta reintenta si el webhook no
 * contesta 200 a tiempo o si contesta un 5xx, y el handler llama a un modelo en
 * el medio, que tarda segundos: no es un caso teórico, es lo que va a pasar el
 * día que la API esté lenta.
 *
 * Cada reintento volvía a correr todo: se guardaba el mensaje entrante dos
 * veces, se creaba el lead dos veces, se avanzaba la máquina de estados dos
 * veces —lo que puede saltear un paso— y, lo único que ve el cliente, se le
 * contestaba dos veces.
 *
 * CÓMO SE RESUELVE
 *
 * Con un INSERT, no con un SELECT previo. "Fijarse si ya existe y después
 * insertar" tiene una ventana en el medio por la que dos reintentos simultáneos
 * pasan los dos. La clave primaria de la tabla es el id del mensaje: el segundo
 * insert falla, y eso es la respuesta.
 *
 * EL CASO FEO
 *
 * Si el proceso se muere a mitad —timeout de la función—, la marca queda puesta
 * y nunca se completa. Con una marca de "visto" a secas, el reintento se
 * descartaría y el cliente se quedaría sin respuesta, en silencio. Por eso se
 * guarda además cuándo se terminó: un reintento que encuentra una marca vieja
 * sin completar sabe que el primer intento no llegó a ningún lado y lo vuelve a
 * tomar.
 *
 * De los dos errores posibles, contestar dos veces es incómodo pero visible; no
 * contestar es una venta perdida de la que nadie se entera.
 */

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cuánto se espera antes de dar por muerto un intento que no completó.
 *
 * Tiene que ser cómodamente mayor que lo que puede tardar el handler completo
 * —incluida la llamada al modelo— y cómodamente menor que la paciencia de un
 * cliente esperando respuesta. Cinco minutos cumple las dos.
 */
const MS_PARA_DARLO_POR_CAIDO = 5 * 60 * 1000;

/** Código de Postgres para violación de unicidad. Es el caso esperado, no un error. */
const YA_EXISTE = '23505';

export type Reclamo =
  /** Nadie lo atendió: seguí. */
  | 'nuevo'
  /** Otro intento lo está atendiendo o ya lo atendió: cortá, no hagas nada. */
  | 'duplicado'
  /** Un intento anterior lo tomó y se murió sin terminar: seguí vos. */
  | 'reintento_de_uno_caido'
  /** No se pudo determinar. Se atiende igual: ver el comentario de abajo. */
  | 'sin_marca';

/**
 * Toma el mensaje para atenderlo, o avisa que ya lo tomó otro.
 *
 * Ante cualquier problema con la base devuelve 'sin_marca' y el webhook sigue
 * atendiendo. Es deliberado: si la tabla no existe todavía, o la consulta falla,
 * el peor resultado de seguir es una respuesta repetida; el de cortar es un
 * canal de ventas mudo por un problema de infraestructura que no tiene nada que
 * ver con el mensaje.
 */
export async function reclamarMensaje(
  id: string | null,
  proveedor: string,
  telefono: string,
): Promise<Reclamo> {
  // Sin id no hay con qué deduplicar. No debería pasar —los dos proveedores lo
  // mandan— pero si pasa, se atiende.
  if (!id) return 'sin_marca';

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('whatsapp_mensajes_procesados')
    .insert({ id, proveedor, telefono });

  if (!error) return 'nuevo';

  if (error.code !== YA_EXISTE) {
    console.error('[whatsapp][idempotencia] no se pudo marcar el mensaje %s:', id, error);
    return 'sin_marca';
  }

  // Ya está tomado. Falta saber si por alguien que sigue trabajando o por
  // alguien que se murió.
  const { data, error: errorLectura } = await supabase
    .from('whatsapp_mensajes_procesados')
    .select('recibido_en, completado_en')
    .eq('id', id)
    .maybeSingle();

  if (errorLectura || !data) {
    console.error('[whatsapp][idempotencia] no se pudo leer la marca de %s:', id, errorLectura);
    return 'sin_marca';
  }

  if (data.completado_en) return 'duplicado';

  const umbral = new Date(Date.now() - MS_PARA_DARLO_POR_CAIDO).toISOString();
  if (data.recibido_en > umbral) {
    // Reciente y sin terminar: hay otro intento en vuelo ahora mismo.
    return 'duplicado';
  }

  // Pasó el tiempo y nadie lo completó. Se vuelve a tomar, pero con la condición
  // adentro del UPDATE: si dos reintentos llegan juntos a esta línea, el segundo
  // no encuentra fila que actualizar y se retira. Con un update a secas pasarían
  // los dos, que es justo lo que esto viene a evitar.
  const { data: retomado, error: errorRetoma } = await supabase
    .from('whatsapp_mensajes_procesados')
    .update({ recibido_en: new Date().toISOString() })
    .eq('id', id)
    .is('completado_en', null)
    .lt('recibido_en', umbral)
    .select('id');

  if (errorRetoma) {
    console.error('[whatsapp][idempotencia] no se pudo retomar %s:', id, errorRetoma);
    return 'sin_marca';
  }

  if (retomado && retomado.length > 0) {
    console.warn(
      '[whatsapp][idempotencia] el mensaje %s habia quedado a medias, se reintenta',
      id,
    );
    return 'reintento_de_uno_caido';
  }

  return 'duplicado';
}

/**
 * Deja el mensaje como terminado.
 *
 * Va justo antes de contestarle al proveedor, no en un `finally`: si el proceso
 * se muere de golpe el `finally` tampoco corre, y ese es exactamente el caso en
 * el que queremos que la marca quede sin completar para que el reintento sirva
 * de algo.
 */
export async function marcarMensajeCompletado(id: string | null): Promise<void> {
  if (!id) return;
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('whatsapp_mensajes_procesados')
      .update({ completado_en: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('[whatsapp][idempotencia] no se pudo completar %s:', id, error);
    }
  } catch (e) {
    // Nunca hacer fallar la respuesta por esto: el mensaje ya se contestó.
    console.error('[whatsapp][idempotencia] no se pudo completar %s:', id, e);
  }
}
