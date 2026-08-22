/**
 * Quién puede llamar a las funciones del agente de voz.
 *
 * POR QUÉ HACÍA FALTA
 *
 * La compuerta de acceso (src/proxy.ts) abre TODO el prefijo `/api/retell/`, con
 * la nota "agente de voz, con su propia API key". Esa nota era cierta para una
 * sola de las cuatro rutas: `/webhook`, que verifica la firma con el SDK de
 * Retell. Las otras tres —`cotizar`, `registrar-lead` y `transferir`— no
 * comprobaban nada. Verificado contra producción, sin ninguna credencial:
 *
 *   POST /api/retell/cotizar         200
 *   POST /api/retell/registrar-lead  200   ← y este escribe en la base
 *   POST /api/retell/transferir      200
 *
 * `registrar-lead` mete filas en la cola de ventas. Cualquiera que descubriera
 * la URL podía llenarla de leads falsos, que alguien del equipo iba a llamar.
 *
 * POR QUÉ UN SECRETO COMPARTIDO Y NO LA FIRMA DE RETELL
 *
 * Estas tres no son webhooks: son "custom functions", que el agente invoca
 * durante la llamada. Retell no las firma como firma los webhooks, así que
 * `Retell.verify` no aplica. Lo que sí permite es mandar cabeceras propias en la
 * configuración de cada función, y ahí va este secreto.
 *
 * QUÉ PASA SI FALTA EL SECRETO
 *
 * No bloquea: registra el problema y deja pasar. Es el mismo criterio que rige
 * para Meta, Twilio y Resend, y por el mismo motivo: un despliegue al que se le
 * olvidó una variable no debería dejar mudo al agente de voz en medio de una
 * llamada con un cliente. Pero es una configuración incompleta, no un estado
 * válido, y el log lo dice así.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

/** La cabecera que hay que configurar en cada función custom de Retell. */
export const CABECERA = 'x-quilmes-retell';

export type Veredicto =
  /** El secreto coincide. */
  | 'ok'
  /** No hay secreto configurado: no se puede comprobar nada. */
  | 'sin-secreto'
  /** Hay secreto y la cabecera no vino, o no coincide. */
  | 'no-coincide';

/**
 * Compara sin filtrar por tiempo.
 *
 * timingSafeEqual explota si los largos difieren, así que se iguala antes con
 * un hash de largo fijo. Comparar con === filtra el largo y los primeros
 * caracteres, que sobre un secreto corto alcanza para adivinarlo.
 */
function igualesSinFiltrar(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verificarAccesoDeRetell(request: Request): Veredicto {
  const secreto = process.env.RETELL_FUNCION_SECRET;
  if (!secreto) return 'sin-secreto';

  const vino = request.headers.get(CABECERA);
  if (!vino) return 'no-coincide';

  return igualesSinFiltrar(vino, secreto) ? 'ok' : 'no-coincide';
}

/**
 * Lo que devuelve la ruta cuando no corresponde atender, o null si sí.
 *
 * Devuelve la respuesta ya armada para que cada ruta sea una línea, y para que
 * el criterio —qué se rechaza y qué se deja pasar— viva en un solo lugar.
 */
export function respuestaSiNoCorresponde(request: Request, ruta: string): Response | null {
  const veredicto = verificarAccesoDeRetell(request);

  if (veredicto === 'sin-secreto') {
    console.error(
      '[Retell] RETELL_FUNCION_SECRET no configurada: %s esta aceptando llamadas ' +
        'sin comprobar quien las hace',
      ruta,
    );
    return null;
  }

  if (veredicto === 'no-coincide') {
    console.error('[Retell] %s: la cabecera %s no coincide, se rechaza', ruta, CABECERA);
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  return null;
}
