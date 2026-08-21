/**
 * Elige el transporte de WhatsApp.
 *
 * Se controla con WHATSAPP_PROVEEDOR: 'meta' o 'twilio'.
 *
 * El valor por defecto es twilio a propósito, y conviene que siga siéndolo
 * hasta que Meta pase tráfico real: si alguien despliega sin definir la
 * variable, lo que sigue andando es lo que ya funcionaba. Un default que se
 * cambia solo es la clase de cosa que se descubre cuando un cliente escribe un
 * sábado y no le contesta nadie.
 */

import { transporteTwilio } from './twilio';
import { transporteMeta } from './meta';
import type { Transporte } from './tipos';

export type { MensajeEntrante, Transporte } from './tipos';
export { normalizarTelefono } from './tipos';

function elegir(): Transporte {
  const elegido = (process.env.WHATSAPP_PROVEEDOR || 'twilio').trim().toLowerCase();

  if (elegido === 'meta') {
    if (!transporteMeta.configurado()) {
      // Se avisa fuerte pero NO se cambia solo a Twilio: si alguien pidió Meta
      // y las credenciales no están, contestar por el número viejo es peor que
      // no contestar —el cliente recibiría respuestas desde un número que la
      // fábrica ya no usa—. Que falle ruidosamente es lo correcto.
      console.error(
        '[whatsapp] WHATSAPP_PROVEEDOR=meta pero faltan META_WA_TOKEN o ' +
        'META_WA_PHONE_NUMBER_ID. El canal no va a poder responder.',
      );
    }
    return transporteMeta;
  }

  if (elegido !== 'twilio') {
    console.error(
      `[whatsapp] WHATSAPP_PROVEEDOR="${elegido}" no existe. Los valores son ` +
      `"meta" o "twilio". Se usa twilio.`,
    );
  }
  return transporteTwilio;
}

/**
 * El transporte activo.
 *
 * Se resuelve una vez, al cargar el módulo: cambiar el proveedor pide un
 * despliegue, que es lo que se quiere. Un cambio de proveedor en caliente, a
 * mitad de una conversación, dejaría mensajes saliendo por dos números
 * distintos.
 */
export const transporte: Transporte = elegir();

/**
 * Contesta el alta del webhook de Meta, sea cual sea el proveedor activo.
 *
 * VA POR FUERA DEL TRANSPORTE ACTIVO A PROPOSITO.
 *
 * Meta verifica la URL antes de mandar un solo mensaje, y esa verificacion hay
 * que pasarla mientras Twilio todavia esta atendiendo clientes. Si esto
 * dependiera de WHATSAPP_PROVEEDOR habria que apagar el canal que funciona para
 * poder dar de alta el que todavia no, y quedarse sin WhatsApp en el medio del
 * tramite.
 *
 * Contestarlo con Twilio activo no abre nada: el desafio solo se devuelve si el
 * token coincide con META_WA_VERIFY_TOKEN, que es nuestro.
 */
export function responderAltaDeWebhook(request: Request): Response | null {
  return transporteMeta.responderVerificacionDeAlta?.(request) ?? null;
}
