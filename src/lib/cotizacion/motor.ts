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

import { calculateUnfolded, calculateTotalM2, MEDIDA_MINIMA } from '@/lib/utils/box-calculations';
import { getPricePerM2, getProductionDays } from '@/lib/utils/pricing';
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
  'Lo único que se cobra aparte es el polímero, que va a cargo del comprador: ' +
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
  /**
   * Null cuando el pedido no se puede vender (ver `impedimento`).
   *
   * Son null y no cero a proposito: cero se imprime como "$0" y pasa por una
   * oferta rota; null no compila hasta que quien consume decide que decir. El
   * agente del sitio cotizo 272 m² —por debajo del piso de 500— y cerro
   * ofreciendo "coordinarlo por WhatsApp", que es exactamente la negociacion
   * que no queremos abrir. El precio no tiene que existir.
   */
  price_per_m2: number | null;
  unit_price: number | null;
  subtotal: number | null;
  /** PDF con las líneas de corte, plegado y las áreas donde va el diseño */
  template_pdf: string;
}

/**
 * Por qué un pedido no se puede tomar, cuando no se puede.
 *
 * Son dos motivos distintos y conviene no mezclarlos: uno es de volumen —no
 * llega al piso de venta— y el otro es de canal —quiere una medida propia con
 * un volumen que solo alcanza para catálogo—. El segundo no se resuelve
 * comprando más de lo mismo: hay que elegir una medida estándar o subir bastante
 * más.
 */
export interface Impedimento {
  tipo: 'bajo_minimo' | 'medida_propia_sin_volumen';
  motivo: string;
  /** Cuántas cajas de ESTA medida hacen falta para poder avanzar. */
  cajas_necesarias: number | null;
  m2_faltantes: number;
}

/** Una caja con precio. Es lo que sale cuando el pedido se puede vender. */
export interface BoxResultConPrecio extends BoxResult {
  price_per_m2: number;
  unit_price: number;
  subtotal: number;
}

interface QuoteBase {
  total_m2: number;
  /**
   * Impuestos, explicitos para que nadie tenga que calcularlos.
   * `subtotal` NUNCA incluye IVA; `total` siempre lo incluye.
   */
  tax_rate: number;
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
  /**
   * Envío para ESTE pedido, ya resuelto.
   *
   * Existe porque un asistente que tiene que comparar los m² del pedido contra
   * el umbral y sacar la conclusión, alguna vez la saca mal. Paso en una
   * prueba: con 2.932,8 m² afirmo "como supera los 3.000 m², el envío es
   * gratuito", y de paso invento la zona. Las dos cosas eran compromisos que
   * la fabrica hubiera tenido que cumplir.
   */
  /**
   * Cuando el pedido quedo cerca de un escalon, que gana si lo cruza.
   *
   * OJO CON ESTO, PORQUE NO ES INTUITIVO. La escalera aplica el precio nuevo
   * AL PEDIDO ENTERO, no al tramo que excede, asi que cruzar un umbral BAJA la
   * factura en pesos:
   *
   *   2.659 cajas -> 2.999,3 m² a $900  ->  $2.699.417
   *   2.660 cajas -> 3.000,5 m² a $740  ->  $2.220.355
   *
   * Una caja mas y la fabrica cobra $479.062 menos. Es DELIBERADO: es el
   * incentivo por volumen, decidido por el dueño el 19/08/2026 sabiendo el
   * efecto. Si alguien alguna vez lo quiere corregir, las salidas son precio
   * marginal por tramo o un piso que impida que el total baje.
   *
   * Los numeros van calculados, no como umbral para que el asistente compare:
   * un modelo que tiene que deducir "te faltan X" alguna vez lo deduce mal, y
   * este es un mensaje que mueve plata.
   */
  next_tier: {
    m2_faltantes: number;
    cajas_aproximadas: number | null;
    nuevo_precio_por_m2: number;
    nuevo_subtotal: number;
    ahorro: number;
    que_gana: string;
  } | null;
  shipping: {
    /** Si el volumen alcanza el mínimo. La distancia no se sabe acá. */
    meets_free_shipping_volume: boolean;
    note: string;
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
 * El resultado de cotizar. Es una union discriminada por `cotizable` A PROPOSITO.
 *
 * Antes era un solo objeto con el precio siempre presente y un `impedimento`
 * opcional al costado, y no lo miraba nadie: los nueve canales que cotizan
 * leian el precio sin preguntar si el pedido se podia vender. El agente del
 * sitio cotizo 272 m² —por debajo del piso de 500— y cerro ofreciendo
 * "coordinarlo por WhatsApp", que es la negociacion de cantidad que el minimo
 * excluyente existe para evitar.
 *
 * Con la union, leer `subtotal` sin haber chequeado `cotizable` no compila. La
 * regla la hace cumplir el compilador, no la disciplina de quien escribe el
 * proximo canal.
 */
export type QuoteResult = QuoteBase &
  (
    | {
        cotizable: true;
        impedimento: null;
        boxes: BoxResultConPrecio[];
        subtotal: number;
        tax_amount: number;
        total_with_tax: number;
      }
    | {
        cotizable: false;
        impedimento: Impedimento;
        boxes: BoxResult[];
        subtotal: null;
        tax_amount: null;
        total_with_tax: null;
      }
  );

/**
 * PDF con la caja desplegada: líneas de corte, de plegado y las áreas donde
 * puede ir el diseño. El cliente lo baja, ubica su arte encima y lo devuelve
 * listo para producir. Se genera al vuelo, no hace falta pedirlo por mail.
 */
export function urlPlantilla(largo: number, ancho: number, alto: number): string {
  return `${SITIO}/api/box-template?length=${largo}&width=${ancho}&height=${alto}`;
}

/**
 * Valida una lista de cajas y devuelve los motivos, en castellano.
 *
 * Faltaba el limite del rollo, que es el que mas se choca en la practica: el
 * ancho de plancha es ancho + alto y no puede pasar de 1.200 mm. Sin esa
 * validacion el servidor MCP cotizo 400x700x700 —1.400 mm de plancha— y
 * devolvio un precio para una caja que la fabrica no puede producir. Una
 * cotizacion imposible es peor que un rechazo: la persona la lleva a su jefe.
 *
 * Los mensajes van en castellano y sin nombres de campo. Antes salia
 * "boxes[0].length_mm must be between 200 and 2000" y eso terminaba en la
 * pantalla de un cliente, o peor, en la respuesta que un asistente le lee.
 */
export function validarCajas(boxes: BoxInput[]): string[] {
  const errors: string[] = [];

  boxes.forEach((box, index) => {
    const cual = boxes.length > 1 ? `Caja ${index + 1}: ` : '';

    if (!box.length_mm || !box.width_mm || !box.height_mm) {
      errors.push(`${cual}Faltan medidas: hacen falta largo, ancho y alto en milímetros.`);
      return;
    }

    if (
      box.length_mm < MEDIDA_MINIMA.largo ||
      box.width_mm < MEDIDA_MINIMA.ancho ||
      box.height_mm < MEDIDA_MINIMA.alto
    ) {
      errors.push(
        `${cual}La medida mínima que fabricamos es ` +
          `${MEDIDA_MINIMA.largo}x${MEDIDA_MINIMA.ancho}x${MEDIDA_MINIMA.alto} mm y pediste ` +
          `${box.length_mm}x${box.width_mm}x${box.height_mm} mm.`,
      );
    }

    if (box.length_mm > 2000 || box.width_mm > 2000 || box.height_mm > 1500) {
      errors.push(
        `${cual}La medida máxima es 2000x2000x1500 mm y pediste ` +
          `${box.length_mm}x${box.width_mm}x${box.height_mm} mm.`,
      );
    }

    // El limite que mas se choca: la plancha sale de ancho + alto y el rollo
    // de carton mide 1.200 mm. El largo no entra en esta cuenta.
    const plancha = box.width_mm + box.height_mm;
    if (plancha > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      errors.push(
        `${cual}Esa caja no se puede fabricar: ancho más alto dan ${plancha} mm y el ancho ` +
          `máximo de plancha es ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho del rollo ` +
          `de cartón. Bajando el ancho o el alto entra; el largo no tiene ese límite.`,
      );
    }

    if (!box.quantity || box.quantity < 1 || !Number.isInteger(box.quantity)) {
      errors.push(`${cual}La cantidad tiene que ser un número entero de cajas.`);
    }

    if (
      box.printing_colors !== undefined &&
      (box.printing_colors < 0 || box.printing_colors > RETAIL_CONFIG.MAX_PRINTING_COLORS)
    ) {
      errors.push(
        `${cual}Imprimimos hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores y pediste ${box.printing_colors}.`,
      );
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
    ? `Impresión flexográfica hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores, desde ${incluidaDesde} m². El costo de impresión ya está incluido en el precio por m². No se imprime sobre medidas estándar de catálogo: para llevar impresión hay que fabricar una medida propia.`
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
  const boxResults: BoxResultConPrecio[] = [];
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

    // El subtotal sale del precio por caja YA REDONDEADO, no de los m² por el
    // precio del m².
    //
    // Parece al revés, porque el costo real es por metro cuadrado. Pero el
    // precio unitario por la cantidad es la unica cuenta que el cliente rehace
    // a mano, y tiene que cerrar. Con 1.000 cajas de 400x300x250 el m² daba
    // $789.525 y el precio por caja $789,53: quien multiplicaba obtenia
    // $789.530 y sobraban cinco pesos. La diferencia es de centavos por unidad
    // —0,0006% en ese pedido— y no mueve la aguja de la fabrica; que el numero
    // no cierre a la vista si mueve la confianza.
    const precioPorCaja = Math.round((boxTotalSqm * adjustedPricePerM2 / box.quantity) * 100) / 100;
    const subtotal = Math.round(precioPorCaja * box.quantity * 100) / 100;
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
      unit_price: precioPorCaja,
      subtotal,
      template_pdf: urlPlantilla(box.length_mm, box.width_mm, box.height_mm),
    });
  }

  totalM2 = Math.round(totalM2 * 100) / 100;
  totalSubtotal = Math.round(totalSubtotal * 100) / 100;

  // ¿Se puede tomar este pedido?
  //
  // Dos umbrales distintos. El piso de venta es de superficie y no de unidades:
  // lo que limita es cuánto cartón entra en una tirada. Y la personalización
  // —medida propia, troquelado, impresión— arranca más arriba, porque implica
  // preparar la máquina para un desarrollo que no está en catálogo.
  const m2PorCajaPrimera = boxResults[0]?.sqm_per_box || 0;
  const cajasPara = (m2Objetivo: number) =>
    m2PorCajaPrimera > 0 && boxes.length === 1
      ? Math.ceil(m2Objetivo / m2PorCajaPrimera)
      : null;

  let impedimento: Impedimento | null = null;

  if (totalM2 < config.min_m2_pedido) {
    const faltan = config.min_m2_pedido - totalM2;
    const cajas = cajasPara(config.min_m2_pedido);
    impedimento = {
      tipo: 'bajo_minimo',
      motivo:
        `El mínimo de compra es ${config.min_m2_pedido.toLocaleString('es-AR')} m² de cartón y ` +
        `este pedido son ${totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m².` +
        (cajas ? ` Con esta medida, son ${cajas.toLocaleString('es-AR')} cajas.` : ''),
      cajas_necesarias: cajas,
      m2_faltantes: Math.round(faltan * 10) / 10,
    };
  }

  // El otro impedimento: quiere una medida que no esta en catalogo, con un
  // volumen que solo alcanza para catalogo. No se arregla comprando un poco
  // mas: o elige una medida estandar, o sube hasta el umbral de a medida.
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
  const llegaAlMinimo = totalM2 >= RETAIL_CONFIG.MIN_M2_PEDIDO;

  const hayCatalogo = medidasEnStock.length > 0;
  const todasEnStock = hayCatalogo && boxResults.every((b) =>
    medidasEnStock.some((m) =>
      m.length_mm === b.length_mm && m.width_mm === b.width_mm &&
      m.height_mm === b.height_mm && m.stock >= b.quantity,
    ),
  );

  const sePuedeComprarOnline = volumenDeStock && llegaAlMinimo && todasEnStock;
  const esDeStock = volumenDeStock;

  // Solo se usa en la rama con precio: por debajo del piso manda el impedimento.
  // Tenia una rama para el bajo minimo que decia "para este volumen lo
  // coordinamos por WhatsApp", que es justo la invitacion a negociar la
  // cantidad que el minimo excluyente existe para evitar. Ahora esa rama no
  // existe: si no llega al piso, no hay cotizacion.
  const motivoNoOnline = !volumenDeStock || !hayCatalogo
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
  const summaryConPrecio =
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
  // La impresion pide dos cosas, no una.
  //
  // Llegar al volumen minimo, y que la medida NO sea una del catalogo
  // estandar: esas se producen en tirada larga sin arte y no se imprimen. Un
  // pedido de 2.000 m² de una medida de catalogo alcanza el volumen y aun asi
  // no lleva impresion.
  const medidaDeCatalogo = hayCatalogo && boxResults.some((b) =>
    medidasEnStock.some((m) =>
      m.length_mm === b.length_mm && m.width_mm === b.width_mm && m.height_mm === b.height_mm,
    ),
  );
  const impresionDisponible = totalM2 >= config.printing_min_m2 && !medidaDeCatalogo;

  // Segundo impedimento: pide una medida propia con un volumen que solo alcanza
  // para catalogo.
  //
  // Es distinto del piso de venta y no se arregla comprando un poco mas: o
  // elige una medida estandar, o sube hasta el umbral de produccion a medida.
  // Es exactamente la consulta que llegaba por WhatsApp —cajas troqueladas por
  // 50 unidades— y que el sitio dejaba pasar.
  if (!impedimento && !medidaDeCatalogo && hayCatalogo && totalM2 < config.wholesale_min_m2) {
    const cajasParaAMedida = cajasPara(config.wholesale_min_m2);
    impedimento = {
      tipo: 'medida_propia_sin_volumen',
      motivo:
        `Esta medida no está en el catálogo, así que hay que fabricarla, y la producción a ` +
        `medida arranca en ${config.wholesale_min_m2.toLocaleString('es-AR')} m². Este pedido son ` +
        `${totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m².` +
        (cajasParaAMedida
          ? ` Serían ${cajasParaAMedida.toLocaleString('es-AR')} cajas de esta medida.`
          : '') +
        ` Por debajo de ese volumen trabajamos con medidas estándar de catálogo, sin impresión.`,
      cajas_necesarias: cajasParaAMedida,
      m2_faltantes: Math.round((config.wholesale_min_m2 - totalM2) * 10) / 10,
    };
  }

  // A partir de aca ya estan los dos impedimentos calculados, asi que recien
  // ahora se puede decidir si este pedido tiene precio.
  //
  // El minimo de compra es EXCLUYENTE: no es un piso que se negocia. Dar un
  // precio "de referencia" por debajo abria justo la conversacion que no
  // queremos —el agente cotizo 272 m² y cerro ofreciendo coordinarlo por
  // WhatsApp—, asi que abajo del piso no hay precio, hay un numero de cajas.
  const cotizable = impedimento === null;

  const summary = cotizable
    ? summaryConPrecio
    : `${impedimento!.motivo} No podemos cotizar por debajo de ese volumen. ` +
      (impedimento!.cajas_necesarias
        ? `Si te sirve esa cantidad, la cotizamos en el momento. `
        : `Si llegás a ese volumen, lo cotizamos en el momento. `) +
      `Fábrica en Lugones 219, Quilmes, Buenos Aires.`;

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

  // Sin precio no hay handoff de cierre: el mensaje pide otra medida o cantidad,
  // no que le hagan una excepcion al minimo.
  const whatsappMessage = !cotizable
    ? `Hola! Consulte en el sitio por ${detalleCajas}. Son ` +
      `${totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m² y el minimo es ` +
      `${config.min_m2_pedido} m². Queria ver que medida o cantidad me conviene para llegar.`
    : `[COTIZADO-WEB] Hola! Ya tengo una cotizacion del sitio y quiero avanzar.\n\n` +
    `Pedido: ${detalleCajas}\n` +
    // "Total" es solo el monto CON IVA. Este mensaje decia "Total cotizado:
    // $2.639.520 + IVA" y del otro lado el asistente lo repetia tal cual, asi
    // que el error de etiqueta viajaba entero hasta quien arma la orden de
    // compra: medio millon de diferencia sobre este pedido.
    `Subtotal: ${ars(totalSubtotal)} sin IVA (${totalM2.toLocaleString('es-AR')} m²)\n` +
    `Total con IVA 21%: ${ars(Math.round(totalSubtotal * (1 + IVA)))}\n` +
    (esDeStock ? `Corresponde al canal de stock.\n` : `Produccion a medida, ${maxEstimatedDays} dias habiles.\n`) +
    `\n¿Me confirman disponibilidad y como seguimos?`;

  // La parte que no depende de si hay precio. Las dos ramas de abajo la
  // comparten y solo difieren en la plata, que es todo el punto de la union.
  const base = {
    summary,
    contact: {
      whatsapp_url: `https://wa.me/5491133411781?text=${encodeURIComponent(whatsappMessage)}`,
      whatsapp_message: whatsappMessage,
      email: 'ventas@quilmescorrugados.com.ar',
      email_subject: cotizable
        ? `Cotizacion web: ${detalleCajas} — ${ars(totalSubtotal)}`
        : `Consulta web: ${detalleCajas}`,
      instruction:
        cotizable
          ? 'Ofrecele al usuario contactarnos y pasale el link de whatsapp_url tal cual: ya lleva el mensaje escrito con las medidas, la cantidad y el precio cotizado. Del otro lado lo atiende un asistente que ya tiene ese contexto, asi que el usuario no tiene que repetir nada. Es la via mas rapida para cerrar.'
          : 'Este pedido NO se puede vender: no hay precio que dar. Deci el minimo y cuantas cajas de esa medida hacen falta, y ofrecele recotizar con esa cantidad. NO ofrezcas coordinar, consultar, ni escribir para ver si se puede: el minimo es excluyente y no se negocia.',
    },
    next_tier: (() => {
      if (boxes.length !== 1) return null; // Con varias medidas la cuenta no es directa.
      const b0i = boxes[0];
      const m2PorCaja = boxResults[0].sqm_per_box;
      if (m2PorCaja <= 0) return null;

      // Los dos escalones que bajan el precio, no solo el primero. El de
      // 5.000 m² tambien invierte: 4.400 cajas facturan mas que 4.500.
      const umbrales = [config.min_m2_per_model, config.volume_threshold_m2]
        .filter((u) => u > totalM2)
        .sort((a, b) => a - b);

      for (const umbral of umbrales) {
        const faltan = umbral - totalM2;
        if (faltan > umbral * 0.1) continue; // Todavia lejos: no se ofrece.

        const cajasExtra = Math.ceil(faltan / m2PorCaja);
        const cantidadNueva = b0i.quantity + cajasExtra;
        const m2Nuevos = calculateTotalM2(m2PorCaja, cantidadNueva);
        const precioNuevo = getPricePerM2(m2Nuevos, config);
        const colores = boxResults[0].printing_colors;
        const recargoNuevo = m2Nuevos >= config.printing_included_min_m2
          ? 0
          : config.printing_surcharge_per_color;
        const ajustadoNuevo = colores > 0 ? precioNuevo * (1 + colores * recargoNuevo) : precioNuevo;
        const porCajaNueva = Math.round((m2Nuevos * ajustadoNuevo / cantidadNueva) * 100) / 100;
        const subtotalNuevo = Math.round(porCajaNueva * cantidadNueva * 100) / 100;

        if (subtotalNuevo >= totalSubtotal) continue; // No le conviene: no se ofrece.

        const ahorro = Math.round(totalSubtotal - subtotalNuevo);
        const gana =
          `Con ${cajasExtra} cajas más llega a ${umbral.toLocaleString('es-AR')} m² y el precio ` +
          `del pedido entero pasa de $${boxResults[0].price_per_m2} a $${precioNuevo} por m². ` +
          `Se lleva ${cajasExtra} cajas más y paga $${ahorro.toLocaleString('es-AR')} menos.`;

        return {
          m2_faltantes: Math.round(faltan * 10) / 10,
          cajas_aproximadas: cajasExtra,
          nuevo_precio_por_m2: precioNuevo,
          nuevo_subtotal: subtotalNuevo,
          ahorro,
          que_gana:
            umbral === config.free_shipping_min_m2
              ? `${gana} Y ademas entra en el envio gratis dentro de ${config.free_shipping_max_km} km.`
              : gana,
        };
      }
      return null;
    })(),
    shipping: {
      meets_free_shipping_volume: totalM2 >= config.free_shipping_min_m2,
      note:
        totalM2 >= config.free_shipping_min_m2
          ? `Este pedido alcanza los ${config.free_shipping_min_m2.toLocaleString('es-AR')} m² que ` +
            `pide el envío gratis. Falta confirmar la dirección: es gratis dentro de un radio de ` +
            `${config.free_shipping_max_km} km de la fábrica en Quilmes. Más lejos, el flete se cotiza aparte.`
          : `Este pedido son ${totalM2.toLocaleString('es-AR')} m² y no llega a los ` +
            `${config.free_shipping_min_m2.toLocaleString('es-AR')} m² que pide el envío gratis. ` +
            `Se retira en la fábrica de Quilmes o se coordina el envío con el costo a cargo del comprador.`,
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
        ? medidaDeCatalogo
          ? 'Las medidas estándar de catálogo no se imprimen: se producen en tirada larga sin arte. Para llevar impresión hay que fabricar una medida propia.'
          : `La impresión se hace desde ${config.printing_min_m2.toLocaleString('es-AR')} m². Este pedido no llega a ese volumen.`
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
    total_m2: totalM2,
    tax_rate: IVA,
    subtotal_includes_tax: false as const,
    currency: 'ARS',
    estimated_days: maxEstimatedDays,
    valid_until: validUntil.toISOString().split('T')[0],
    minimum_m2: config.wholesale_min_m2,
    meets_minimum: !esDeStock,
    channel: (esDeStock ? 'stock' : 'made_to_order') as 'stock' | 'made_to_order',
    can_buy_online: cotizable && sePuedeComprarOnline,
    channel_note: !cotizable
      ? impedimento!.motivo
      : !esDeStock
        ? `Producción a medida. Cotización válida ${config.quote_validity_days} días.`
        : sePuedeComprarOnline
          ? `Esta medida está en stock y el pedido llega al mínimo: se compra online, con entrega más rápida, en ${SITIO}/cajas`
          : `${motivoNoOnline ?? 'Coordinamos este pedido directamente.'} El precio de arriba es el que corresponde.`,
  };

  // Las dos ramas. Salen tipadas distinto a proposito: con `cotizable: false`
  // el compilador no deja leer `subtotal` sin haberlo chequeado.
  if (!cotizable) {
    return {
      ...base,
      cotizable: false,
      impedimento: impedimento!,
      boxes: boxResults.map((b) => ({
        ...b,
        price_per_m2: null,
        unit_price: null,
        subtotal: null,
      })),
      subtotal: null,
      tax_amount: null,
      total_with_tax: null,
    };
  }

  return {
    ...base,
    cotizable: true,
    impedimento: null,
    boxes: boxResults,
    subtotal: totalSubtotal,
    tax_amount: Math.round(totalSubtotal * IVA * 100) / 100,
    total_with_tax: Math.round(totalSubtotal * (1 + IVA) * 100) / 100,
  };
}
