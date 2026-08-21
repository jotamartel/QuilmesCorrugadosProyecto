/**
 * WhatsApp por Twilio.
 *
 * Es lo que está andando hoy, sobre el número sandbox. Se conserva mientras el
 * trámite de la cuenta de Meta avanza: cuando esa esté lista se cambia la
 * variable de entorno, y si algo falla se vuelve acá cambiándola de nuevo.
 */

import twilio from 'twilio';
import { firmaTwilioValida, urlsPosibles } from '@/lib/webhooks/firmas';
import { normalizarTelefono, type MensajeEntrante, type Transporte } from './tipos';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const NUMERO = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

const cliente = SID && TOKEN ? twilio(SID, TOKEN) : null;

/** Twilio quiere el destino con el prefijo del canal. */
function conPrefijo(telefono: string): string {
  return telefono.startsWith('whatsapp:') ? telefono : `whatsapp:${telefono}`;
}

/** El cuerpo llega como formulario, no como JSON. */
function comoFormulario(cuerpoCrudo: string): Record<string, string> {
  const params: Record<string, string> = {};
  new URLSearchParams(cuerpoCrudo).forEach((valor, clave) => {
    params[clave] = valor;
  });
  return params;
}

export const transporteTwilio: Transporte = {
  nombre: 'twilio',

  configurado() {
    return cliente !== null;
  },

  async enviarTexto(telefono, texto) {
    if (!cliente) {
      console.log('[whatsapp:twilio] sin credenciales, no se envia:', texto.slice(0, 50));
      return false;
    }
    try {
      await cliente.messages.create({ from: NUMERO, to: conPrefijo(telefono), body: texto });
      return true;
    } catch (error) {
      console.error('[whatsapp:twilio] error enviando texto:', error);
      return false;
    }
  },

  async enviarDocumento(telefono, urlDelArchivo) {
    if (!cliente) return false;
    try {
      // WhatsApp no permite texto junto con un adjunto: el texto va aparte.
      await cliente.messages.create({
        from: NUMERO,
        to: conPrefijo(telefono),
        mediaUrl: [urlDelArchivo],
      });
      return true;
    } catch (error) {
      console.error('[whatsapp:twilio] error enviando documento:', error);
      return false;
    }
  },

  // No bloquea, a propósito. Twilio firma la URL que tiene cargada en su panel,
  // que detrás de un proxy puede no ser la que ve el servidor: un rechazo acá
  // puede ser culpa nuestra y se lleva puestos mensajes de clientes reales.
  // Este proveedor además está de salida.
  rechazaFirmaInvalida: false,

  async firmaValida(request, cuerpoCrudo) {
    if (!TOKEN) return null;

    const firma = request.headers.get('x-twilio-signature');
    if (!firma) return false;

    // Twilio firma sobre la URL exacta que tiene configurada, y detrás de un
    // proxy la que ve el servidor puede no ser esa. Por eso se prueban las
    // variantes en vez de asumir una.
    const params = comoFormulario(cuerpoCrudo);
    const { pathname, search } = new URL(request.url);
    return urlsPosibles(pathname, search.replace(/^\?/, '')).some((url) =>
      firmaTwilioValida(TOKEN, firma, url, params),
    );
  },

  // Twilio manda un mensaje por request: la lista trae cero o uno.
  leerEntrantes(cuerpoCrudo) {
    const params = comoFormulario(cuerpoCrudo);
    const from = params.From;
    if (!from) return [];

    const numMedia = Number(params.NumMedia || '0');
    const tieneMedia =
      numMedia > 0 || !!params.MediaUrl0 || !!params.MediaContentType0;

    const entrante: MensajeEntrante = {
      telefono: normalizarTelefono(from),
      texto: (params.Body || '').trim(),
      tieneMedia,
      id: params.MessageSid || null,
    };
    return [entrante];
  },

  respuestaDeRecibido() {
    // TwiML vacio: recibido, y no contestes nada por tu cuenta.
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  },
};
