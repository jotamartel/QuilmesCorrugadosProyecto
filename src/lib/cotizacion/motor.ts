/**
 * Motor de cotizacion.
 *
 * Vivia adentro de app/api/v1/quote/route.ts. Se saco de ahi cuando aparecio
 * el segundo consumidor —el servidor MCP— porque un route file no puede
 * exportar nada que no sea un handler HTTP, y la alternativa era que el MCP
 * llamara a la API por HTTP contra si mismo o, peor, que copiara la formula.
 *
 * Dos copias de un calculo de precios se desincronizan. Este archivo es la
 * unica fuente: lo usan la API publica (GET y POST) y las tools de MCP, asi
 * que un cambio de logica llega a los tres caminos al mismo tiempo.
 */

import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal, getProductionDays } from '@/lib/utils/pricing';
import { SITE_URL } from '@/lib/site';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import type { PricingConfig } from '@/lib/types/database';

const SITIO = SITE_URL;

/**
 * IVA general de Argentina.
 *
 * Se expone en la respuesta en vez de dejar que el que consume lo calcule.
 * En una prueba real ChatGPT recibio el subtotal sin IVA, le aplico el 21% por
 * su cuenta y le presento al usuario un total con impuesto. Le salio bien, pero
 * es una operacion que no tendria que estar haciendo: si algun dia cambia la
 * alicuota, o si el modelo se equivoca en la cuenta, el cliente llega con un
 * numero que no es el nuestro y la discusion la tenemos nosotros.
 *
 * Dar el total ya calculado saca esa ambiguedad del medio.
 */
const IVA = 0.21;

/**
 * El polímero es la matriz flexográfica: una por color, se hace una vez por
 * diseño y sirve para todas las tiradas siguientes de ese arte. No entra en el
 * precio por m² y va a cargo del comprador, y como depende del diseño y no del
 * volumen, se cotiza caso por caso en vez de tener precio de lista.
 */
const NOTA_POLIMERO =
  'Aparte se cotiza el polímero de impresión, que va a cargo del comprador: ' +
  'es una matriz por color, se hace una vez por diseño y queda para las ' +
  'próximas tiradas de ese mismo arte.';

export interface BoxInput {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing?: boolean;
  printing_colors?: number;
}

export interface BoxResult {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;
  sheet_width_mm: number;
  sheet_length_mm: number;
  sqm_per_box: number;
  total_sqm: number;
  price_per_m2: number;
  unit_price: number;
  subtotal: number;
  /** PDF con las líneas de corte, plegado y las áreas donde va el diseño */
  template_pdf: string;
}

export interface QuoteResult {
  boxes: BoxResult[];
  total_m2: number;
  subtotal: number;
  /**
   * Impuestos, explicitos para que nadie tenga que calcularlos.
   * `subtotal` NUNCA incluye IVA; `total` siempre lo incluye.
   */
  tax_rate: number;
  tax_amount: number;
  total_with_tax: number;
  subtotal_includes_tax: false;
  currency: string;
  estimated_days: number;
  valid_until: string;
  minimum_m2: number;
  meets_minimum: boolean;
  /** Por qué canal corresponde este volumen */
  channel: 'stock' | 'made_to_order';
  /**
   * Si el cliente puede comprarlo solo desde la web. Ser del canal de stock no
   * alcanza: hace falta llegar al mínimo de unidades y que la medida esté en
   * el catálogo. Sin esto se derivaba a /cajas a chocarse con el mínimo.
   */
  can_buy_online: boolean;
  /** Explicación en castellano, pensada para que un asistente la lea al usuario */
  channel_note: string;
  /**
   * Frase lista para leerle al usuario. Existe para que un asistente no tenga
   * que recalcular ni parafrasear: si parafrasea, se equivoca.
   */
  summary: string;
  /**
   * Handoff a WhatsApp. El asistente le ofrece al usuario mandar este mensaje
   * y del otro lado lo levanta el bot con todo el contexto ya cargado, sin
   * volver a preguntar medidas ni cantidad.
   */
  contact: {
    whatsapp_url: string;
    whatsapp_message: string;
    email: string;
    email_subject: string;
    /** Qué debería hacer el asistente con esto */
    instruction: string;
  };
  /** Impresión: si aplica a este pedido y cómo enviar el diseño */
  printing: {
    available: boolean;
    min_m2: number;
    max_colors: number;
    price_note: string;
    /** Lo único de la impresión que se cobra aparte. */
    polymer_note: string;
    /** Plantilla de la primera medida. Cada caja trae la suya en boxes[].template_pdf */
    template_pdf: string;
    how_it_works: string;
  };
}

/**
 * PDF con la caja desplegada: líneas de corte, de plegado y las áreas donde
 * puede ir el diseño. El cliente lo baja, ubica su arte encima y lo devuelve
 * listo para producir. Se genera al vuelo, no hace falta pedirlo por mail.
 */
export function urlPlantilla(largo: number, ancho: number, alto: number): string {
  return `${SITIO}/api/box-template?length=${largo}&width=${ancho}&height=${alto}`;
}

/** Valida una lista de cajas. Devuelve los errores encontrados. */
export function validarCajas(boxes: BoxInput[]): string[] {
  const errors: string[] = [];
  boxes.forEach((box, index) => {
    const prefix = `boxes[${index}]`;
    if (!box.length_mm || box.length_mm < 100 || box.length_mm > 2000) {
      errors.push(`${prefix}.length_mm must be between 100 and 2000`);
    }
    if (!box.width_mm || box.width_mm < 100 || box.width_mm > 2000) {
      errors.push(`${prefix}.width_mm must be between 100 and 2000`);
    }
    if (!box.height_mm || box.height_mm < 50 || box.height_mm > 1500) {
      errors.push(`${prefix}.height_mm must be between 50 and 1500`);
    }
    if (!box.quantity || box.quantity < 1 || !Number.isInteger(box.quantity)) {
      errors.push(`${prefix}.quantity must be a positive integer`);
    }
    if (box.printing_colors !== undefined && (box.printing_colors < 0 || box.printing_colors > RETAIL_CONFIG.MAX_PRINTING_COLORS)) {
      errors.push(`${prefix}.printing_colors must be between 0 and ${RETAIL_CONFIG.MAX_PRINTING_COLORS}`);
    }
  });
  return errors;
}

/**
 * Calcula la cotización. Es la misma para GET y POST: un agente de IA que
 * navega con GET tiene que obtener exactamente el mismo precio que un cliente
 * que postea desde el sitio.
 */
/**
 * Formatea un precio POR UNIDAD conservando los centavos.
 *
 * El subtotal no sale de multiplicar el precio por caja: sale de los m² de
 * carton por el precio del m². Con 2.600 cajas de 300x380x420, el precio por
 * caja es $1.015,20 y el subtotal $2.639.520. Al mostrar la caja redondeada a
 * $1.015, el cliente que multiplica los dos numeros que ve en pantalla obtiene
 * $2.639.000 y le faltan $520.
 *
 * La cuenta siempre estuvo bien; lo que engañaba era la pantalla. En una
 * pagina de cotizacion eso es caro: si el unico numero que el cliente puede
 * verificar a mano no le da, deja de creerle a los otros.
 *
 * Los totales siguen yendo en pesos enteros, que es como se leen.
 */
/**
 * Cómo se cobra la impresión, en una frase, leída de la config vigente.
 *
 * Existe porque el "+15% por color" estaba afirmado a mano en ocho superficies
 * —el llms.txt, el MCP, la página de precios, el prompt del bot— y dejó de ser
 * cierto: desde cierto volumen el costo ya viene incluido. Una frase escrita a
 * mano en ocho lugares se corrige en seis.
 */
export function notaImpresion(config: {
  printing_min_m2: number;
  printing_included_min_m2: number;
  printing_surcharge_per_color: number;
}): string {
  const incluidaDesde = config.printing_included_min_m2.toLocaleString('es-AR');
  const pct = Math.round(config.printing_surcharge_per_color * 100);
  const sinFranja = config.printing_min_m2 >= config.printing_included_min_m2;

  const base = sinFranja
    ? `Impresión flexográfica hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores, desde ${incluidaDesde} m². El costo de impresión está incluido en el precio por m².`
    : `Impresión flexográfica hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores. Desde ${incluidaDesde} m² el costo está incluido en el precio por m²; por debajo de ese volumen cada color suma ${pct}%.`;

  return `${base} ${NOTA_POLIMERO}`;
}

export function precioUnitarioARS(n: number): string {
  const tieneCentavos = Math.round(n * 100) % 100 !== 0;
  return (
    '$' +
    n.toLocaleString('es-AR', {
      minimumFractionDigits: tieneCentavos ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

export function calcularCotizacion(
  boxes: BoxInput[],
  config: PricingConfig,
  /** Medidas del catálogo de stock, para saber si el pedido se puede despachar ya */
  medidasEnStock: Array<{ length_mm: number; width_mm: number; height_mm: number; stock: number }> = [],
): QuoteResult {
  const boxResults: BoxResult[] = [];
  let totalM2 = 0;
  let totalSubtotal = 0;
  let maxEstimatedDays = 0;

  for (const box of boxes) {
    const printingColors = box.printing_colors || 0;
    const boxHasPrinting = box.has_printing || printingColors > 0;

    const unfolded = calculateUnfolded(box.length_mm, box.width_mm, box.height_mm);
    const boxTotalSqm = calculateTotalM2(unfolded.m2, box.quantity);
    totalM2 += boxTotalSqm;

    const pricePerM2 = getPricePerM2(boxTotalSqm, config);

    // El recargo por color solo aplica POR DEBAJO del volumen desde el cual la
    // impresión ya viene incluida en el precio por m². Antes se cobraba
    // siempre, así que a partir de 3.000 m² se estaba cobrando dos veces lo
    // mismo: una en el precio del m² y otra como recargo.
    //
    // Lo único que se cobra aparte es el polímero, que va a cargo del comprador
    // y se cotiza según el diseño. No entra en este cálculo a propósito: no
    // depende del volumen y ponerle un número de lista acá lo convertiría en
    // una promesa de precio que nadie revisó.
    const impresionIncluida = boxTotalSqm >= config.printing_included_min_m2;
    const recargoPorColor = impresionIncluida ? 0 : config.printing_surcharge_per_color;

    const adjustedPricePerM2 = boxHasPrinting && printingColors > 0
      ? pricePerM2 * (1 + printingColors * recargoPorColor)
      : pricePerM2;

    const subtotal = calculateSubtotal(boxTotalSqm, adjustedPricePerM2);
    totalSubtotal += subtotal;

    const estimatedDays = getProductionDays(boxHasPrinting, config);
    if (estimatedDays > maxEstimatedDays) maxEstimatedDays = estimatedDays;

    boxResults.push({
      length_mm: box.length_mm,
      width_mm: box.width_mm,
      height_mm: box.height_mm,
      quantity: box.quantity,
      has_printing: boxHasPrinting,
      printing_colors: printingColors,
      sheet_width_mm: unfolded.unfoldedWidth,
      sheet_length_mm: unfolded.unfoldedLength,
      sqm_per_box: unfolded.m2,
      total_sqm: boxTotalSqm,
      price_per_m2: adjustedPricePerM2,
      unit_price: Math.round((subtotal / box.quantity) * 100) / 100,
      subtotal,
      template_pdf: urlPlantilla(box.length_mm, box.width_mm, box.height_mm),
    });
  }

  totalM2 = Math.round(totalM2 * 100) / 100;
  totalSubtotal = Math.round(totalSubtotal * 100) / 100;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + config.quote_validity_days);

  // Por debajo de wholesale_min_m2 no se produce a medida: se vende de stock.
  const volumenDeStock = totalM2 < config.wholesale_min_m2;

  // Pero "canal de stock" no alcanza para poder comprarlo online. Hacen falta
  // dos cosas mas, y si falta cualquiera hay que coordinar con un vendedor:
  //   1. llegar al minimo de 100 cajas
  //   2. que la medida este efectivamente en el catalogo, con stock
  // Sin este chequeo mandabamos al cliente a /cajas a chocarse con el minimo,
  // o a buscar una medida que no existe.
  const cantidadTotal = boxResults.reduce((s, b) => s + b.quantity, 0);
  const llegaAlMinimo = cantidadTotal >= RETAIL_CONFIG.MIN_CANTIDAD;

  const hayCatalogo = medidasEnStock.length > 0;
  const todasEnStock = hayCatalogo && boxResults.every((b) =>
    medidasEnStock.some((m) =>
      m.length_mm === b.length_mm && m.width_mm === b.width_mm &&
      m.height_mm === b.height_mm && m.stock >= b.quantity,
    ),
  );

  const sePuedeComprarOnline = volumenDeStock && llegaAlMinimo && todasEnStock;
  const esDeStock = volumenDeStock;

  const motivoNoOnline = !volumenDeStock ? null
    : !llegaAlMinimo
      ? `Son ${cantidadTotal} cajas y el autoservicio arranca en ${RETAIL_CONFIG.MIN_CANTIDAD}. Para esta cantidad lo coordinamos por WhatsApp.`
      : !hayCatalogo
        ? null
        : `Esta medida no está entre las estándar que tenemos en stock, así que se fabrica a pedido. Escribinos y lo vemos.`;

  const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
  const b0 = boxResults[0];
  const detalle = boxResults.length === 1
    ? `${b0.quantity.toLocaleString('es-AR')} cajas de ${b0.length_mm}x${b0.width_mm}x${b0.height_mm} mm a ${precioUnitarioARS(b0.unit_price)} por caja`
    : `${boxResults.length} medidas distintas, ${boxResults.reduce((s, b) => s + b.quantity, 0).toLocaleString('es-AR')} cajas en total`;

  // El resumen lleva los dos numeros: el subtotal, que es como cotizamos, y el
  // total con IVA, que es lo que el cliente termina pagando. Antes solo iba el
  // primero con un "+ IVA" al lado, y un asistente hacia la cuenta por su
  // cuenta para decirle al usuario cuanto sale de verdad. Darle los dos evita
  // que calcule, y evita que se equivoque calculando.
  const summary =
    `Quilmes Corrugados: ${detalle}. Subtotal ${ars(totalSubtotal)} ARS sin IVA, ` +
    `total ${ars(Math.round(totalSubtotal * (1 + IVA)))} ARS con IVA 21% incluido ` +
    `(${totalM2.toLocaleString('es-AR')} m²). ` +
    (!esDeStock
      ? `Producción a medida, ${maxEstimatedDays} días hábiles.`
      : sePuedeComprarOnline
        ? `Se vende de stock, entrega inmediata, se compra online en ${SITIO}/cajas.`
        : `${motivoNoOnline ?? 'Se coordina directamente.'}`) +
    ` Fábrica en Lugones 219, Quilmes, Buenos Aires. WhatsApp +54 9 11 3341-1781.`;

  // La impresión se produce a medida, así que arranca en el mismo volumen que
  // el canal a medida. Por debajo se vende de stock, que va sin imprimir.
  const impresionDisponible = !esDeStock;

  // Si a este pedido, por su volumen, la impresión ya le viene incluida.
  const impresionIncluidaEnElPedido = totalM2 >= config.printing_included_min_m2;

  // Mensaje de handoff. Lleva medidas, cantidad y el precio ya cotizado para
  // que del otro lado no se vuelva a preguntar lo mismo ni se cotice distinto.
  // El prefijo [COTIZADO-WEB] es la marca que usa el bot de WhatsApp para
  // reconocer que la conversacion arranca con una cotizacion hecha.
  const detalleCajas = boxResults
    .map((b) => `${b.quantity.toLocaleString('es-AR')} de ${b.length_mm}x${b.width_mm}x${b.height_mm} mm` +
      (b.printing_colors > 0 ? ` con impresion a ${b.printing_colors} color${b.printing_colors > 1 ? 'es' : ''}` : ''))
    .join(' + ');

  const whatsappMessage =
    `[COTIZADO-WEB] Hola! Ya tengo una cotizacion del sitio y quiero avanzar.\n\n` +
    `Pedido: ${detalleCajas}\n` +
    `Total cotizado: ${ars(totalSubtotal)} + IVA (${totalM2.toLocaleString('es-AR')} m²)\n` +
    (esDeStock ? `Corresponde al canal de stock.\n` : `Produccion a medida, ${maxEstimatedDays} dias habiles.\n`) +
    `\n¿Me confirman disponibilidad y como seguimos?`;

  return {
    summary,
    contact: {
      whatsapp_url: `https://wa.me/5491133411781?text=${encodeURIComponent(whatsappMessage)}`,
      whatsapp_message: whatsappMessage,
      email: 'ventas@quilmescorrugados.com.ar',
      email_subject: `Cotizacion web: ${detalleCajas} — ${ars(totalSubtotal)}`,
      instruction:
        'Ofrecele al usuario contactarnos y pasale el link de whatsapp_url tal cual: ya lleva el mensaje escrito con las medidas, la cantidad y el precio cotizado. Del otro lado lo atiende un asistente que ya tiene ese contexto, asi que el usuario no tiene que repetir nada. Es la via mas rapida para cerrar.',
    },
    printing: {
      available: impresionDisponible,
      min_m2: config.printing_min_m2,
      max_colors: RETAIL_CONFIG.MAX_PRINTING_COLORS,
      /**
       * El polímero se nombra siempre, incluso cuando la impresión está
       * incluida. Es el único costo de impresión que paga el cliente aparte, y
       * omitirlo hace que el total parezca cerrado cuando no lo está: la
       * sorpresa aparece recién en la factura.
       */
      price_note: !impresionDisponible
        ? `La impresión se produce a medida, desde ${config.printing_min_m2.toLocaleString('es-AR')} m². Este pedido sale de stock, sin imprimir.`
        : impresionIncluidaEnElPedido
          ? `Desde ${config.printing_included_min_m2.toLocaleString('es-AR')} m² el costo de impresión ya está incluido en el precio por m², hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores. ${NOTA_POLIMERO}`
          : `Cada color suma ${Math.round(config.printing_surcharge_per_color * 100)}% al precio por m², hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores. Desde ${config.printing_included_min_m2.toLocaleString('es-AR')} m² el costo queda incluido y no se cobra recargo. ${NOTA_POLIMERO}`,
      /** Qué se cobra aparte y qué no. Es la pregunta que sigue al precio. */
      polymer_note: NOTA_POLIMERO,
      template_pdf: urlPlantilla(b0.length_mm, b0.width_mm, b0.height_mm),
      how_it_works: impresionDisponible
        ? 'Descargá el PDF de la plantilla: trae la caja desplegada con las líneas de corte, las de plegado y las áreas donde puede ir el diseño. Ubicá tu arte sobre esas áreas y mandá el archivo a ventas@quilmescorrugados.com.ar o por WhatsApp, y se produce con eso. No hace falta pedir la plantilla: se genera sola con las medidas.'
        : 'Para imprimir hay que producir a medida. Si el pedido llega al mínimo, la plantilla se descarga de template_pdf.',
    },
    boxes: boxResults,
    total_m2: totalM2,
    subtotal: totalSubtotal,
    tax_rate: IVA,
    tax_amount: Math.round(totalSubtotal * IVA * 100) / 100,
    total_with_tax: Math.round(totalSubtotal * (1 + IVA) * 100) / 100,
    subtotal_includes_tax: false,
    currency: 'ARS',
    estimated_days: maxEstimatedDays,
    valid_until: validUntil.toISOString().split('T')[0],
    minimum_m2: config.wholesale_min_m2,
    meets_minimum: !esDeStock,
    channel: esDeStock ? 'stock' : 'made_to_order',
    can_buy_online: sePuedeComprarOnline,
    channel_note: !esDeStock
      ? `Producción a medida. Cotización válida ${config.quote_validity_days} días.`
      : sePuedeComprarOnline
        ? `Esta medida está en stock y el pedido llega al mínimo: se compra online, con entrega más rápida, en ${SITIO}/cajas`
        : `${motivoNoOnline ?? 'Coordinamos este pedido directamente.'} El precio de arriba es el que corresponde.`,
  };
}
