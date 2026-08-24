/**
 * Guardar lo que se habla en el chat del sitio.
 *
 * POR QUE ES "MEJOR ESFUERZO" Y NUNCA TIRA
 *
 * Esto corre en el camino de una persona esperando una respuesta. Si la base
 * está lenta o caída, lo que NO puede pasar es que el chat deje de contestar
 * por no poder anotar la conversación: el visitante vino a preguntar, no a que
 * lo registremos. Todo error se loguea y se sigue.
 *
 * Es la misma decisión que ya tomó el endpoint con el respaldo de Groq: la
 * conversación vale más que la prolijidad de los registros.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export interface ParaGuardar {
  /** El id que genera el navegador. Sin esto no hay forma de agrupar. */
  sesion: string;
  pregunta: string;
  respuesta: string;
  pagina?: string;
  /** Qué herramientas usó el agente: de ahí salen las marcas de atención. */
  herramientas?: string[];
}

/**
 * Anota un ida y vuelta del chat.
 *
 * Se guarda DESPUES de responderle a la persona y antes de devolver: en
 * serverless, lo que se deja "para después" del return se corta a la mitad.
 */
export async function anotarIntercambio(datos: ParaGuardar): Promise<void> {
  const { sesion, pregunta, respuesta, pagina, herramientas = [] } = datos;
  if (!sesion?.trim()) return;

  try {
    const db = createAdminClient();

    // Las dos marcas que hacen que valga la pena abrir la conversación. Salen
    // de lo que el agente HIZO, no de adivinar sobre el texto.
    const sinRespuesta = herramientas.includes('no_se_la_respuesta');
    const pidioHumano = herramientas.includes('derivar_a_humano');

    // Upsert por sesión: la primera vez crea, las siguientes actualizan. El
    // onConflict evita la carrera de dos mensajes casi simultáneos.
    const { data: conversacion, error: errorConv } = await db
      .from('chat_web_conversaciones')
      .upsert(
        { sesion, pagina_inicial: pagina ?? null, ultima_en: new Date().toISOString() },
        { onConflict: 'sesion', ignoreDuplicates: false },
      )
      .select('id, cantidad_mensajes, hubo_pregunta_sin_respuesta, pidio_humano')
      .single();

    if (errorConv || !conversacion) {
      console.error('[chat-web] no se pudo registrar la conversacion:', errorConv?.message);
      return;
    }

    const { error: errorMsjs } = await db.from('chat_web_mensajes').insert([
      { conversacion_id: conversacion.id, rol: 'visitante', contenido: pregunta, pagina: pagina ?? null },
      { conversacion_id: conversacion.id, rol: 'asistente', contenido: respuesta, pagina: pagina ?? null },
    ]);
    if (errorMsjs) console.error('[chat-web] no se pudieron guardar los mensajes:', errorMsjs.message);

    // Las marcas se PRENDEN y no se apagan: que la persona después haya
    // seguido con algo que el asistente sí sabía no borra que hubo una
    // pregunta sin respuesta. Eso es justo lo que hay que ir a mirar.
    await db
      .from('chat_web_conversaciones')
      .update({
        cantidad_mensajes: (conversacion.cantidad_mensajes ?? 0) + 2,
        hubo_pregunta_sin_respuesta: conversacion.hubo_pregunta_sin_respuesta || sinRespuesta,
        pidio_humano: conversacion.pidio_humano || pidioHumano,
      })
      .eq('id', conversacion.id);
  } catch (e) {
    console.error('[chat-web] error inesperado al anotar:', e);
  }
}

/**
 * Un dato de contacto que la persona dejó escrito.
 *
 * Es lo único que convierte una consulta perdida en una que se puede
 * responder, así que se busca en lo que escribe: nadie va a completar un
 * formulario para preguntar si hacemos cajas navideñas.
 *
 * Deliberadamente conservador. Un falso positivo pone en el panel un contacto
 * que no existe y alguien pierde el tiempo escribiéndole: es peor que no
 * detectar nada.
 */
export function contactoEnElTexto(texto: string): string | null {
  const mail = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
  if (mail) return mail[0].toLowerCase();

  // Un teléfono argentino escrito de las formas en que la gente lo escribe.
  // Pide 10 dígitos como mínimo para no confundirse con una medida ni con una
  // cantidad de cajas, que es lo que más se escribe en este chat.
  const limpio = texto.replace(/[\s().-]/g, '');
  const tel = limpio.match(/(?:\+?54)?(?:9)?(?:11|[23]\d{2,3})\d{6,8}/);
  if (tel && tel[0].replace(/\D/g, '').length >= 10) return tel[0];

  return null;
}

/** Anota el contacto si aparece, sin pisar uno que ya estaba. */
export async function anotarContactoSiHay(sesion: string, texto: string): Promise<void> {
  const contacto = contactoEnElTexto(texto);
  if (!contacto || !sesion?.trim()) return;
  try {
    await createAdminClient()
      .from('chat_web_conversaciones')
      .update({ contacto })
      .eq('sesion', sesion)
      .is('contacto', null);
  } catch (e) {
    console.error('[chat-web] no se pudo anotar el contacto:', e);
  }
}
