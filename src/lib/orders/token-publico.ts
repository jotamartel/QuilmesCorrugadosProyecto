import { SITE_URL } from '@/lib/site';

/**
 * La forma del token publico de una orden.
 *
 * Lo genera la base (migracion 031: 16 bytes aleatorios en base64url, 22
 * caracteres exactos). Aca vive la regla de forma que se aplica ANTES de tocar
 * la base, para no gastar una query en 'aaa' ni en un path malicioso.
 *
 * Exactamente 22 y no "22 o mas" a proposito: la columna admite tokens mas
 * largos por si algun dia sube la entropia, pero la app valida lo que existe
 * HOY. Un rango abierto suena a flexibilidad y es superficie: un "token" de
 * 500 caracteres pasaria la regex y pegaria en la base para nada. Si la
 * entropia sube, este es el UNICO lugar que se toca.
 */
export const TOKEN_PEDIDO_RE = /^[A-Za-z0-9_-]{22}$/;

export function esTokenPedidoValido(x: unknown): x is string {
  return typeof x === 'string' && TOKEN_PEDIDO_RE.test(x);
}

/**
 * La URL publica del pedido.
 *
 * El path 'pedido' esta congelado en las plantillas de WhatsApp aprobadas por
 * Meta ('www.quilmescorrugados.com.ar/pedido/{{n}}'): cambiarlo aca sin
 * re-aprobar las plantillas rompe todos los links que salgan por WhatsApp.
 */
export function urlSeguimientoPedido(token: string): string {
  return `${SITE_URL}/pedido/${token}`;
}
