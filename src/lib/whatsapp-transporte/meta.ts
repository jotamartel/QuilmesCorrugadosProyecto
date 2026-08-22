/**
 * WhatsApp por la Cloud API de Meta, sin intermediario.
 *
 * QUÉ CAMBIA RESPECTO DE TWILIO
 *
 * Tres cosas, y ninguna es cosmética:
 *
 * 1. El cuerpo llega como JSON anidado, no como formulario. Un mismo POST puede
 *    traer varios mensajes y también avisos de estado —entregado, leído— que no
 *    son mensajes de nadie y hay que ignorar.
 * 2. La firma es un HMAC sobre el cuerpo crudo, en la cabecera
 *    X-Hub-Signature-256. Nada que ver con la de Twilio, que firma sobre la URL
 *    más los campos del formulario.
 * 3. Meta da de alta el webhook con un GET que trae un desafío y espera que se
 *    le devuelva tal cual. Si eso no responde bien, nunca empieza a mandar nada.
 *
 * VARIABLES QUE NECESITA
 *
 *   META_WA_TOKEN            token del system user, para llamar a la Graph API
 *   META_WA_PHONE_NUMBER_ID  el id del número dentro de la WABA, no el número
 *   META_WA_APP_SECRET       para validar la firma del webhook
 *   META_WA_VERIFY_TOKEN     una cadena que elegimos nosotros, para el alta
 *
 * NO ESTÁ PROBADO CONTRA TRÁFICO REAL. La cuenta de Meta todavía está en
 * trámite. Está escrito contra la documentación de la Cloud API y compila, pero
 * hasta que no pase un mensaje de verdad no hay que darlo por bueno: lo primero
 * a confirmar es en qué forma llega el teléfono de un celular argentino.
 */

import crypto from 'node:crypto';
import {
  normalizarTelefono,
  type MensajeEntrante,
  type PlantillaAEnviar,
  type Transporte,
} from './tipos';

const TOKEN = process.env.META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID;
const APP_SECRET = process.env.META_WA_APP_SECRET;
const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN;

/**
 * Versión de la Graph API.
 *
 * Se fija a propósito: que Meta saque una nueva no debería cambiar el
 * comportamiento sin que lo decidamos. Pero fijarla no es gratis — cada versión
 * tiene fecha de vencimiento, y cuando llega, las llamadas dejan de funcionar.
 *
 * Estaba en v21.0, que vence el 21/01/2027. Se movió a v25.0 antes de salir a
 * producción: descubrir esto en enero, con el canal de ventas andando, es
 * bastante peor que cambiarlo ahora.
 *
 * v25.0 salió en febrero de 2026 y vence el 29/07/2028. No se eligió v26.0, que
 * es más nueva, porque salió hace tres semanas: no hay motivo para estrenar la
 * última en el canal por el que entra la mayoría de las consultas.
 *
 * SI ESTÁS LEYENDO ESTO DESPUÉS DE MEDIADOS DE 2028: hay que subirla.
 * scripts/verificar-meta.mts avisa cuando falta menos de un año.
 */
export const VERSION_DE_GRAPH = 'v25.0';
const VERSION = VERSION_DE_GRAPH;
/** Cuándo deja de funcionar la versión de arriba. Lo mira el verificador. */
export const VENCE_LA_VERSION = '2028-07-29';

function urlDeEnvio(): string {
  return `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`;
}

/** Meta quiere el destino en E.164 SIN el más. */
function sinMas(telefono: string): string {
  return telefono.replace(/^\+/, '');
}

async function postear(cuerpo: unknown): Promise<boolean> {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.log('[whatsapp:meta] sin credenciales, no se envia');
    return false;
  }
  try {
    const r = await fetch(urlDeEnvio(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
    });
    if (!r.ok) {
      // El detalle del error de Meta es útil y específico —plantilla no
      // aprobada, fuera de ventana, número no registrado—, así que se registra
      // entero en vez de solo el código.
      console.error('[whatsapp:meta] error enviando:', r.status, (await r.text()).slice(0, 400));
      return false;
    }
    return true;
  } catch (error) {
    console.error('[whatsapp:meta] error enviando:', error);
    return false;
  }
}

/**
 * La comprobacion de la firma, sin depender de la configuracion.
 *
 * Va separada del transporte porque es la unica pieza de todo esto que decide
 * si un mensaje entra o se rechaza, y ahora que una firma invalida BLOQUEA, un
 * error aca deja el canal mudo. Como funcion pura se prueba con los tres casos
 * —clave ausente, cabecera ausente, firma que no cierra— sin tener que recargar
 * modulos ni levantar procesos, que es lo que hacia que no estuviera probada.
 *
 * Devuelve null SOLO si no hay clave con que comprobar. Que no venga cabecera
 * es false: Meta siempre firma, asi que el que no firma no es Meta.
 */
export function verificarFirmaMeta(
  secreto: string | undefined,
  cabecera: string | null,
  cuerpoCrudo: string,
): boolean | null {
  if (!secreto) return null;
  if (!cabecera) return false;

  const esperada =
    'sha256=' + crypto.createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest('hex');

  // timingSafeEqual explota si los largos difieren, asi que se chequea antes.
  const a = Buffer.from(cabecera);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Un mensaje del payload de Meta, o null si no trae de quien viene. */
function comoMensajeEntrante(mensaje: Record<string, unknown>): MensajeEntrante | null {
  const tipo = String(mensaje?.type || '');
  const texto: string =
    tipo === 'text'
      ? String((mensaje.text as Record<string, unknown>)?.body || '')
      // Un boton o una opcion de lista llegan con el texto en otro lado, y para
      // la logica de arriba son lo mismo que si lo hubiera tipeado.
      : tipo === 'button'
        ? String((mensaje.button as Record<string, unknown>)?.text || '')
        : tipo === 'interactive'
          ? String(
              ((mensaje.interactive as Record<string, unknown>)?.button_reply as Record<string, unknown>)?.title ||
                ((mensaje.interactive as Record<string, unknown>)?.list_reply as Record<string, unknown>)?.title ||
                '',
            )
          : '';

  const entrante: MensajeEntrante = {
    telefono: normalizarTelefono(String(mensaje?.from || '')),
    texto: texto.trim(),
    tieneMedia: ['audio', 'image', 'video', 'document', 'sticker', 'voice'].includes(tipo),
    id: mensaje?.id ? String(mensaje.id) : null,
  };
  return entrante.telefono ? entrante : null;
}

export const transporteMeta: Transporte = {
  nombre: 'meta',

  configurado() {
    return !!(TOKEN && PHONE_NUMBER_ID);
  },

  async enviarTexto(telefono, texto) {
    return postear({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sinMas(telefono),
      type: 'text',
      // preview_url en false: si el texto lleva un link a la plantilla, no
      // queremos que WhatsApp arme una tarjeta de vista previa arriba.
      text: { preview_url: false, body: texto },
    });
  },

  async enviarPlantilla(telefono, plantilla: PlantillaAEnviar) {
    const valores = plantilla.variables ?? [];

    // Meta rechaza el envio si falta un valor o si viene vacio, y el error no
    // dice cual. Se corta antes, con un mensaje que se entiende.
    if (valores.some((v) => !v || !v.trim())) {
      console.error(
        '[whatsapp:meta] la plantilla "%s" tiene variables vacias: %j',
        plantilla.nombre, valores,
      );
      return false;
    }

    return postear({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sinMas(telefono),
      type: 'template',
      template: {
        name: plantilla.nombre,
        language: { code: plantilla.idioma },
        // Sin variables NO va el array de componentes: mandarlo vacio es un
        // error de la API, no un no-op.
        ...(valores.length
          ? {
              components: [{
                type: 'body',
                parameters: valores.map((text) => ({ type: 'text', text })),
              }],
            }
          : {}),
      },
    });
  },

  async enviarDocumento(telefono, urlDelArchivo) {
    return postear({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: sinMas(telefono),
      type: 'document',
      document: {
        link: urlDelArchivo,
        filename: 'plantilla-quilmes-corrugados.pdf',
      },
    });
  },

  // La firma de Meta es un HMAC sobre el cuerpo crudo: no depende de
  // reconstruir una URL ni de qué proxy haya en el medio. Si no cierra, o la
  // clave está mal o no es Meta. En los dos casos corresponde cortar.
  rechazaFirmaInvalida: true,

  async firmaValida(request, cuerpoCrudo) {
    return verificarFirmaMeta(
      APP_SECRET,
      request.headers.get('x-hub-signature-256'),
      cuerpoCrudo,
    );
  },

  leerEntrantes(cuerpoCrudo) {
    try {
      const j = JSON.parse(cuerpoCrudo);
      const entradas: unknown[] = Array.isArray(j?.entry) ? j.entry : [];
      const entrantes: MensajeEntrante[] = [];

      // Se recorren TODOS los niveles. Antes se leia entry[0].changes[0]
      // .messages[0] y se descartaba el resto: Meta batchea cuando llegan varios
      // mensajes juntos y cuando reintenta una entrega que se le acumulo, asi
      // que del segundo mensaje en adelante no quedaba ni registro.
      for (const entrada of entradas) {
        const cambios: unknown[] = Array.isArray((entrada as Record<string, unknown>)?.changes)
          ? ((entrada as Record<string, unknown>).changes as unknown[])
          : [];

        for (const cambio of cambios) {
          const valor = (cambio as Record<string, unknown>)?.value as
            | Record<string, unknown>
            | undefined;
          // Sin `messages` es un aviso de estado —entregado, leido, fallido—.
          // Llega por el mismo webhook y no es un mensaje de nadie: saltearlo es
          // correcto, no un error.
          const mensajes: unknown[] = Array.isArray(valor?.messages)
            ? (valor!.messages as unknown[])
            : [];

          for (const bruto of mensajes) {
            const entrante = comoMensajeEntrante(bruto as Record<string, unknown>);
            if (entrante) entrantes.push(entrante);
          }
        }
      }

      return entrantes;
    } catch (error) {
      console.error('[whatsapp:meta] no se pudo interpretar el cuerpo:', error);
      return [];
    }
  },

  respuestaDeRecibido() {
    // Meta espera un 200 pelado. Si tarda o falla, reintenta.
    return new Response('OK', { status: 200 });
  },

  responderVerificacionDeAlta(request) {
    const { searchParams } = new URL(request.url);
    const modo = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const desafio = searchParams.get('hub.challenge');

    if (modo !== 'subscribe' || !desafio) return null;

    if (!VERIFY_TOKEN || token !== VERIFY_TOKEN) {
      console.error('[whatsapp:meta] alta rechazada: el verify token no coincide');
      return new Response('Forbidden', { status: 403 });
    }
    // Se devuelve el desafío tal cual, en texto plano.
    return new Response(desafio, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
