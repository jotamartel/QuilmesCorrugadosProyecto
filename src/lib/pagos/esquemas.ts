/**
 * Cuánto se paga al confirmar el pedido y cuánto contra entrega.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * La seña es el 50% del total. Ese número estaba escrito en DIEZ lugares y
 * ninguno leía al otro:
 *
 *   - api/orders/route.ts              `Math.round((total / 2) * 100) / 100`
 *   - api/quotes/[id]/convert/route.ts la misma cuenta, otra vez
 *   - utils/pricing.ts                 calculatePaymentAmounts(), que no llamaba nadie
 *   - xubio/invoices.ts                cuatro veces: el porcentaje de la factura de
 *                                      seña, el de la de saldo, y los literales
 *                                      'Seña 50% - Orden ...' y 'Saldo 50% - ...'
 *   - (public)/faq/page.tsx            en prosa, para el que lee la web
 *   - (public)/cotizacion/[id]         en prosa, para el que va a comprar
 *   - whatsapp-ai.ts                   en el prompt del respaldo de WhatsApp
 *
 * El 24/08/2026 un cliente con una cotización de $1.213.197 arriba de la mesa
 * preguntó "Seña de cuanto" y el asistente contestó que no lo sabía con
 * certeza. Diez copias del número, y la única superficie que no lo tenía era
 * la única que estaba hablando con el cliente. Le dimos el CBU y le pedimos el
 * comprobante sin poder decirle de cuánto.
 *
 * Que hubiera diez y ninguna sirviera no es casualidad: un valor repetido se
 * copia donde hace falta, y el lugar donde hacía falta de verdad —contestarle
 * a alguien— era el único donde copiarlo no alcanzaba, porque ahí hay que
 * calcular.
 *
 * Así que el valor vive acá y todos lo leen de acá, incluido el asistente.
 *
 * LOS DOS ESQUEMAS SON DE VERDAD, AUNQUE HOY SOLO SE USE UNO
 *
 * `standard` es seña y saldo. `credit` es sin seña, factura entera a X días,
 * para el cliente con cuenta corriente. La columna existe desde la migración
 * 003 y Xubio ya factura distinto según el esquema.
 *
 * Pero hoy NADIE la escribe: `orders.payment_scheme` se queda siempre en el
 * DEFAULT de la base. Las siete órdenes que hay son 'standard' y ningún
 * cliente tiene `has_credit`. Es decir: la rama de crédito está construida y
 * desconectada. Se respeta igual —el tipo obliga a contemplarla— porque el día
 * que alguien la conecte no queremos que la seña se calcule mal en silencio.
 *
 * EL 50% ES LA CONDICION, NO UNA LEY
 *
 * Dos de las siete órdenes tienen seña de 47,6% y 49,1%: se registró lo que la
 * persona efectivamente transfirió. O sea que el porcentaje es lo que se
 * ofrece, y el monto real de una orden puede diferir. Por eso `repartirElPago`
 * calcula la condición y no pisa lo que ya se haya cobrado.
 */

/**
 * El porcentaje que se pide al confirmar el pedido.
 *
 * Si esto cambia, cambia solo acá — pero ojo con dos cosas fuera del código:
 * las plantillas de WhatsApp aprobadas por Meta llevan el texto congelado y
 * hay que re-aprobarlas, y las órdenes ya cobradas no se recalculan.
 */
export const SENA_PCT = 50;

/**
 * SOBRE QUE TOTAL SE CALCULA LA SEÑA. PENDIENTE DE FERNANDO.
 *
 * El sistema hoy contesta las dos cosas y no coinciden:
 *
 *   - `orders` vive entero en NETO. `orders.total` no tiene IVA (es
 *     subtotal + impresión + troquel + envío, ver calculateTotal en
 *     utils/pricing.ts) y `deposit_amount` es la mitad de eso. El panel
 *     muestra los dos así, sin IVA a la vista en ninguna parte.
 *     Las 7 órdenes que hay y los 10 pagos registrados dan exactamente eso.
 *
 *   - La FACTURA de seña de Xubio se arma con precios netos al 50% y le
 *     agrega IVA 21% arriba (generateInvoiceItems + XUBIO_IVA_21). O sea que
 *     el documento que recibe el cliente totaliza un 21% más que el
 *     `deposit_amount` que quedó guardado.
 *
 * Sobre la cotización del 24/08 la diferencia es $501.321,15 contra
 * $606.598,59: $105.277,44. No es un redondeo, es qué le pedimos que
 * transfiera.
 *
 * MIENTRAS NO ESTE DECIDIDO se usa el neto, que es lo que la fábrica cobró en
 * las siete órdenes y lo que el panel va a conciliar. Si erramos para este
 * lado cobramos de menos y lo recupera el saldo; para el otro lado le
 * cobraríamos de más a alguien y hay que devolverle plata.
 */
export const SENA_SOBRE: 'neto' | 'con_iva' = 'neto';

export type EsquemaDePago = 'standard' | 'credit';

/**
 * Cómo se reparte un total entre lo que se cobra ahora y lo que queda.
 *
 * El redondeo a dos decimales es el mismo del motor: el cliente rehace la
 * cuenta con una calculadora y tiene que cerrar.
 */
export function repartirElPago(
  totalConIva: number,
  esquema: EsquemaDePago = 'standard',
): { alConfirmar: number; contraEntrega: number } {
  const centavos = (n: number) => Math.round(n * 100) / 100;

  if (esquema === 'credit') {
    // Sin seña: se entrega y se factura a los días acordados.
    return { alConfirmar: 0, contraEntrega: centavos(totalConIva) };
  }

  const alConfirmar = centavos((totalConIva * SENA_PCT) / 100);
  return { alConfirmar, contraEntrega: centavos(totalConIva - alConfirmar) };
}

/**
 * Qué porcentaje se factura al entregar.
 *
 * Para el pedido a cuenta corriente es el 100%: no hubo seña, así que la
 * factura de entrega cubre todo.
 */
export function porcentajeAlEntregar(esquema: EsquemaDePago): number {
  return esquema === 'credit' ? 100 : 100 - SENA_PCT;
}

/**
 * Cómo se paga, en palabras, para las superficies que le hablan al cliente.
 *
 * Se arma desde SENA_PCT para que no exista la versión de texto que se olvidó
 * de actualizar, que es exactamente lo que pasaba con la FAQ.
 */
export const PAGO = {
  /**
   * Los medios que se aceptan.
   *
   * Son los cuatro que el sistema sabe registrar —ver PaymentMethod y
   * api/orders/[id]/payment— ni uno más ni uno menos. El eCheq estaba en el
   * tipo, en el endpoint y en el panel, y no se lo decíamos a nadie: la QA lo
   * ata al tipo para que el próximo medio no quede escondido igual.
   *
   * No hay tarjeta: hoy no se cobra con tarjeta.
   */
  formas: 'transferencia bancaria, cheque, eCheq o efectivo',

  /** Para metadatos y frases sueltas. */
  corto: `${SENA_PCT}% de seña al confirmar y el saldo contra entrega`,

  /**
   * Para la FAQ y cualquier lado donde haya lugar para explicar.
   *
   * Dice "el primer pedido" y no "todos" porque el cliente con cuenta
   * corriente no seña. Y no promete condiciones concretas para el habitual:
   * las hay, las define la fábrica caso por caso, y prometer un plazo que
   * después alguien tiene que negar es peor que no mencionarlo.
   */
  largo:
    `Aceptamos transferencia bancaria, cheque, eCheq y efectivo. Para nuevos clientes, el primer ` +
    `pedido lleva un ${SENA_PCT}% de seña al confirmar la orden y el saldo contra entrega. ` +
    `Clientes habituales pueden acceder a condiciones de pago especiales.`,
} as const;
