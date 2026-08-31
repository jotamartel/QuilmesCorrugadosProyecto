/**
 * Los archivos que los clientes mandan por WhatsApp: fotos de cajas que quieren
 * replicar, audios con el pedido, órdenes de compra en PDF.
 *
 * QUÉ HACE
 *
 * Con cada adjunto del mensaje: lo descarga del proveedor, lo guarda en el
 * bucket para que el panel lo muestre y quede para siempre —la URL que da Meta
 * dura cinco minutos y el archivo treinta días—, y si es un audio lo
 * transcribe, porque la transcripción ES el mensaje: entra al historial y al
 * agente como si la persona lo hubiera tipeado.
 *
 * QUÉ NO HACE
 *
 * No decide qué contestarle al cliente. Devuelve lo que pudo guardar y lo que
 * no, y el webhook arma la respuesta con eso. Un archivo que no se pudo
 * descargar no corta el mensaje: el texto que vino al lado se atiende igual.
 */

import Groq, { toFile } from 'groq-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { transporte } from '@/lib/whatsapp-transporte';
import type { MediaEntrante } from '@/lib/whatsapp-transporte/tipos';

/** Un adjunto ya procesado: guardado en el bucket, transcripto si era audio. */
export interface MediaGuardada {
  tipo: MediaEntrante['tipo'];
  /** null cuando la descarga o el guardado fallaron: hubo adjunto pero no está. */
  url: string | null;
  /** El mime real con que quedó guardado, ya sin el "; codecs=..." de Meta. */
  mime: string | null;
  caption: string | null;
  nombreDeArchivo: string | null;
  /** Solo audios, y solo si Groq está configurado y el audio se entendió. */
  transcripcion: string | null;
}

/**
 * El mismo cliente de Groq que usa el clasificador, pero para Whisper.
 *
 * Es opcional a propósito: sin GROQ_API_KEY los audios se guardan y se ven en
 * el panel igual, solo que sin transcripción. Degradar a eso es mejor que
 * hacer depender el archivo de la clave.
 */
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

/**
 * El turbo y no el large a secas: transcribe castellano igual de bien para
 * este uso —frases cortas de pedidos— y tarda y cuesta menos. Un audio de un
 * minuto sale en un par de segundos, que se suman al tiempo de respuesta del
 * webhook, así que acá la velocidad es parte de la corrección.
 */
const MODELO_WHISPER = 'whisper-large-v3-turbo';

/**
 * De "audio/ogg; codecs=opus" a "ogg". Exportada para poder probarla sin red.
 *
 * El mapa cubre lo que WhatsApp realmente manda; lo que no esté cae al subtipo
 * del mime, que para "application/pdf" da "pdf" solo. "bin" es el último
 * recurso: un archivo guardado con extensión rara se abre igual desde el
 * panel, que es lo que importa.
 */
export function extensionParaMime(mime: string | null): string {
  const limpio = (mime || '').split(';')[0].trim().toLowerCase();
  const conocidas: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
  };
  if (conocidas[limpio]) return conocidas[limpio];
  const subtipo = limpio.split('/')[1] || '';
  return /^[a-z0-9]{1,8}$/.test(subtipo) ? subtipo : 'bin';
}

/** El mime sin parámetros: "audio/ogg; codecs=opus" → "audio/ogg". */
export function mimeLimpio(mime: string | null): string | null {
  const limpio = (mime || '').split(';')[0].trim().toLowerCase();
  return limpio || null;
}

async function transcribir(datos: Uint8Array, mime: string): Promise<string | null> {
  if (!groq) return null;
  try {
    const r = await groq.audio.transcriptions.create({
      file: await toFile(Buffer.from(datos), 'audio.' + extensionParaMime(mime), { type: mimeLimpio(mime) || 'audio/ogg' }),
      model: MODELO_WHISPER,
      // Sin fijar el idioma, un audio con ruido de fábrica de fondo salía en
      // otro idioma directamente. Los clientes hablan castellano.
      language: 'es',
      temperature: 0,
    });
    const texto = r.text?.trim();
    return texto || null;
  } catch (error) {
    console.error('[whatsapp:media] no se pudo transcribir el audio:', error);
    return null;
  }
}

/**
 * Descarga, guarda y transcribe los adjuntos de un mensaje.
 *
 * Cada adjunto se procesa por separado y un fallo devuelve el item con url en
 * null en vez de tirar la excepción: el que manda una foto y un texto tiene
 * que recibir respuesta al texto aunque la foto se haya perdido.
 */
export async function procesarMediaEntrante(
  items: MediaEntrante[],
  telefono: string,
): Promise<MediaGuardada[]> {
  const resultado: MediaGuardada[] = [];

  for (const item of items) {
    const base: MediaGuardada = {
      tipo: item.tipo,
      url: null,
      mime: mimeLimpio(item.mime),
      caption: item.caption,
      nombreDeArchivo: item.nombreDeArchivo,
      transcripcion: null,
    };

    if (!transporte.descargarMedia) {
      // Twilio: la media viene de otra forma y no la traducimos. Ver tipos.ts.
      console.log('[whatsapp:media] el transporte %s no descarga media', transporte.nombre);
      resultado.push(base);
      continue;
    }

    try {
      const descargada = await transporte.descargarMedia(item.id);
      if (!descargada) {
        resultado.push(base);
        continue;
      }

      const mime = mimeLimpio(descargada.mime) || 'application/octet-stream';
      // El id de Meta trae caracteres de sobra para un nombre de archivo; con
      // el timestamp alcanza para que no colisionen ni dos fotos en el mismo
      // segundo del mismo cliente.
      const ruta = `whatsapp/${telefono.replace(/\D/g, '')}/${Date.now()}-${item.id.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}.${extensionParaMime(mime)}`;

      const supabase = createAdminClient();
      const { data, error } = await supabase.storage
        .from('quilmes-files')
        .upload(ruta, descargada.datos, { contentType: mime, upsert: false });

      if (error || !data) {
        console.error('[whatsapp:media] no se pudo guardar %s en el bucket:', ruta, error);
        resultado.push(base);
        continue;
      }

      const { data: publica } = supabase.storage.from('quilmes-files').getPublicUrl(data.path);

      resultado.push({
        ...base,
        mime,
        url: publica.publicUrl,
        transcripcion: item.tipo === 'audio' ? await transcribir(descargada.datos, mime) : null,
      });
    } catch (error) {
      console.error('[whatsapp:media] error procesando el adjunto %s:', item.id, error);
      resultado.push(base);
    }
  }

  return resultado;
}

/** Lo que el agente puede mirar por su cuenta: fotos, stickers y PDFs. */
export function esAdjuntoParaAgente(m: MediaGuardada): boolean {
  if (!m.url) return false;
  if (m.tipo === 'imagen' || m.tipo === 'sticker') {
    // Las cuatro que acepta la API de Anthropic. WhatsApp recomprime todo a
    // jpeg o webp, así que en la práctica pasan todas, pero un png original
    // de un catálogo también entra.
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(m.mime || '');
  }
  if (m.tipo === 'documento') return m.mime === 'application/pdf';
  return false;
}

/**
 * Las notas que acompañan el texto cuando algo del adjunto no se pudo ver.
 *
 * Van entre corchetes y en tercera persona porque no las escribió el cliente:
 * son para que el agente sepa qué pasó y lo diga con sus palabras, en vez de
 * responder como si el archivo no existiera.
 */
export function notasParaElAgente(media: MediaGuardada[]): string[] {
  const notas: string[] = [];
  for (const m of media) {
    if (!m.url) {
      notas.push('[La persona mandó un archivo que no se pudo recibir. Pedile que lo mande de nuevo o que escriba la consulta.]');
    } else if (m.tipo === 'audio' && !m.transcripcion) {
      notas.push('[La persona mandó un audio que no se pudo escuchar. Quedó guardado para el equipo; pedile que escriba la consulta si puede.]');
    } else if (m.tipo === 'video') {
      notas.push('[La persona mandó un video. No podés verlo, pero quedó guardado y el equipo lo va a mirar: decíselo.]');
    } else if (m.tipo === 'documento' && m.mime !== 'application/pdf') {
      notas.push(`[La persona mandó un archivo${m.nombreDeArchivo ? ` (${m.nombreDeArchivo})` : ''} que no podés abrir. Quedó guardado y el equipo lo va a mirar: decíselo.]`);
    }
  }
  return notas;
}
