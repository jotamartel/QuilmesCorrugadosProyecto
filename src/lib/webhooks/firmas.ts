/**
 * Validacion de firma para los webhooks de terceros.
 *
 * Estos endpoints son los unicos de la API que no pueden pedir sesion: los
 * llama un servidor ajeno. La compuerta de src/proxy.ts los deja pasar a
 * proposito, asi que la puerta la tiene que poner cada uno validando que
 * quien llama es realmente quien dice ser.
 */

import crypto from 'crypto';
import { validateRequest } from 'twilio';
import { SITE_URL } from '@/lib/site';

/**
 * URLs contra las que puede haber firmado el emisor.
 *
 * No alcanza con reconstruir la URL que recibimos. El proveedor firma la URL
 * EXACTA que tiene cargada en su panel, y hoy el apex responde 308 hacia www:
 * si en Twilio quedo cargada la del apex, la request nos llega en www pero la
 * firma corresponde al apex. Validar solo contra una de las dos rechazaria
 * mensajes legitimos.
 *
 * Por eso se prueban las dos formas del mismo path. Sigue siendo estricto —la
 * firma tiene que ser valida para alguna URL nuestra— y deja de depender de
 * cual de los dos dominios quedo escrito en un panel.
 */
export function urlsPosibles(path: string, query = ''): string[] {
  const sufijo = `${path}${query ? `?${query}` : ''}`;
  const canonico = `${SITE_URL}${sufijo}`;
  // La contraparte con y sin www del dominio canonico.
  const alterno = SITE_URL.includes('://www.')
    ? canonico.replace('://www.', '://')
    : canonico.replace('://', '://www.');
  return [canonico, alterno];
}

/**
 * Firma de Twilio (X-Twilio-Signature).
 *
 * Delega en el SDK de Twilio en vez de reimplementar el HMAC. El paquete ya es
 * dependencia del proyecto —lo usa el envio de mensajes, asi que esta en el
 * mismo bundle— y no tiene sentido mantener nuestra propia copia de una
 * validacion criptografica que el proveedor publica y actualiza.
 *
 * Se escribio a mano primero y se comprobo contra el SDK: acepta lo que el
 * SDK acepta y rechaza lo alterado. Aun asi gana el SDK, porque cubre casos
 * que la version corta no: cuerpos JSON con bodySHA256, y cualquier cambio
 * futuro del esquema de firma.
 */
export function firmaTwilioValida(
  authToken: string,
  firmaRecibida: string,
  url: string,
  params: Record<string, string>,
): boolean {
  try {
    return validateRequest(authToken, firmaRecibida, url, params);
  } catch {
    return false;
  }
}

/**
 * Firma de MercadoPago (x-signature).
 *
 * Llega como "ts=<timestamp>,v1=<hash>". El manifiesto que se firma es
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256 y la
 * clave secreta del webhook, que se saca del panel de MercadoPago.
 */
export function firmaMercadoPagoValida(
  secreto: string,
  cabeceraFirma: string,
  requestId: string | null,
  dataId: string,
): boolean {
  const partes = Object.fromEntries(
    cabeceraFirma.split(',').map((p) => {
      const [k, ...resto] = p.split('=');
      return [k.trim(), resto.join('=').trim()];
    }),
  );

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  // El id llega en minusculas en el manifiesto cuando es alfanumerico.
  const id = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifiesto = `id:${id};${requestId ? `request-id:${requestId};` : ''}ts:${ts};`;

  const esperada = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
  return comparacionSegura(esperada, v1);
}

/**
 * Compara en tiempo constante.
 *
 * Un === corriente corta apenas encuentra el primer byte distinto, y esa
 * diferencia de microsegundos alcanza para ir adivinando una firma byte por
 * byte. timingSafeEqual siempre tarda lo mismo.
 */
function comparacionSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
