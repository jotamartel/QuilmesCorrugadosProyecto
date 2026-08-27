import { MEDIDA_MINIMA } from '@/lib/utils/box-calculations';

export interface RetailConfig {
  // Límites de dimensiones (mm)
  MIN_LARGO: number;
  MAX_LARGO: number;
  MIN_ANCHO: number;
  MAX_ANCHO: number;
  MIN_ALTO: number;
  MAX_ALTO: number;

  // Valores iniciales (mm)
  DEFAULT_LARGO: number;
  DEFAULT_ANCHO: number;
  DEFAULT_ALTO: number;

  // Límites de cantidad
  MIN_CANTIDAD: number;

  /** Piso absoluto de venta, en m² de cartón. */
  MIN_M2_PEDIDO: number;
  /** Desde acá se fabrica una medida propia, con troquelado e impresión. */
  MIN_M2_A_MEDIDA_PROPIA: number;

  // Mínimos
  MIN_M2_A_MEDIDA: number;

  // Envío
  ENVIO_GRATIS_MIN_M2: number;
  ENVIO_GRATIS_KM: number;

  // Impresión
  MAX_PRINTING_COLORS: number;

  // Restricción de producción
  MAX_SHEET_WIDTH: number;

  // Precio minorista (< 1000 m²): $/m²
  RETAIL_PRICE_PER_M2: number;
  PRECIO_MINIMO_PEDIDO: number;
  DECIMALES_PRECIO: number;

  // Precio mayorista (>= 1000 m²)
  WHOLESALE_THRESHOLD_M2: number;
  WHOLESALE_PRICE_PER_M2: number;
  VOLUME_PRICE_PER_M2: number;

  // Interacción
  DRAG_SENSITIVITY: number;
  TRANSITION_DURATION: number;
  HINT_DURATION: number;

  // Envío
  SHIPPING_FACTORY_ADDRESS: string;
  SHIPPING_CABA_AMBA_COST: number;

  // Bounds AMBA
  AMBA_BOUNDS: {
    SW: { lat: number; lng: number };
    NE: { lat: number; lng: number };
  };
}

export const RETAIL_CONFIG: RetailConfig = {
  // Límites de dimensiones (mm). Los mínimos NO se escriben acá: salen de
  // MEDIDA_MINIMA, que es lo que la fábrica puede producir de verdad. Estaban
  // en 100x100x50 y contradecían a isUndersized, que valida el alta de cajas
  // en 200x200x100. Con los viejos, el cotizador minorista tomaba pedidos
  // imposibles y el asistente le informó a un cliente la medida equivocada.
  MIN_LARGO: MEDIDA_MINIMA.largo,
  MAX_LARGO: 800,
  MIN_ANCHO: MEDIDA_MINIMA.ancho,
  MAX_ANCHO: 600,
  MIN_ALTO: MEDIDA_MINIMA.alto,
  MAX_ALTO: 600,

  // Valores iniciales (mm)
  DEFAULT_LARGO: 300,
  DEFAULT_ANCHO: 200,
  DEFAULT_ALTO: 200,

  // Límites de cantidad
  // Quedo como piso de unidades del autoservicio, pero YA NO ES EL MINIMO DE
  // COMPRA: ese es MIN_M2_PEDIDO y se mide en superficie. Con una caja chica,
  // 100 unidades son 34 m² y no alcanzan.
  MIN_CANTIDAD: 100,

  // Espejan pricing_config.min_m2_pedido y wholesale_min_m2. Estan aca porque
  // los metadatos y el JSON-LD son estaticos y no pueden leer la base.
  MIN_M2_PEDIDO: 500,
  MIN_M2_A_MEDIDA_PROPIA: 1000,

  // Escalon donde BAJA EL PRECIO. Espeja pricing_config.min_m2_per_model.
  // OJO: no es un minimo de nada. El minimo para fabricar una medida propia es
  // MIN_M2_A_MEDIDA_PROPIA (1.000). El nombre de esta constante confundio las
  // dos cosas y por eso media docena de textos decian que a medida arrancaba en
  // 3.000. Existe como constante porque los metadatos y el JSON-LD son
  // estaticos y no pueden leer la base.
  MIN_M2_A_MEDIDA: 3000,

  // Condiciones del envio gratis. Espejan pricing_config.free_shipping_min_m2
  // y free_shipping_max_km. El minimo de m² NO es decorativo: el envio gratis
  // es un beneficio del canal mayorista, no del minorista.
  ENVIO_GRATIS_MIN_M2: 3000,
  ENVIO_GRATIS_KM: 60,

  // Colores de impresión flexográfica.
  //
  // Estaba escrito en 17 lugares y no coincidian: 13 paginas decian 3 y la
  // API validaba hasta 4, con max_colors: 4. Como el llms.txt toma ese valor
  // de la API, a un asistente de IA le estabamos diciendo que imprimimos a 4
  // colores y cotizandole un recargo del 60% por algo que la fabrica no hace.
  // Es el peor tipo de error en este canal: sale de nuestra propia fuente y el
  // asistente lo repite como dato verificado.
  MAX_PRINTING_COLORS: 3,

  // Restricción de producción (del negocio)
  // Ancho de plancha = Alto + Ancho (no puede superar 1200mm por los rollos)
  MAX_SHEET_WIDTH: 1200, // mm

  // Precio de stock. Estos son valores de RESPALDO: en runtime se sobreescriben
  // con pricing_config vía /api/public/retail-config, que es la fuente de
  // verdad. Se mantienen alineados con la base para que, si falla la lectura,
  // no se cotice un precio viejo.
  RETAIL_PRICE_PER_M2: 1200,       // ARS por m² — pricing_config.price_per_m2_retail
  PRECIO_MINIMO_PEDIDO: 5000,     // ARS
  DECIMALES_PRECIO: 0,            // Redondeo sin decimales

  // Tope del canal: pasado este volumen el pedido ya no sale de stock sino de
  // produccion a medida, y se deriva al cotizador mayorista.
  WHOLESALE_THRESHOLD_M2: 1000,   // m² — pricing_config.wholesale_min_m2
  WHOLESALE_PRICE_PER_M2: 1000,    // ARS por m² — solo para mostrar a cuanto sale al derivar
  // Piso de la escalera, para poder mostrar "desde $X/m²" en paginas que son
  // componentes cliente y no pueden leer la base. La fuente de verdad sigue
  // siendo pricing_config.price_per_m2_volume; /precios muestra la tabla real.
  VOLUME_PRICE_PER_M2: 800,       // ARS por m² — pricing_config.price_per_m2_volume

  // Interacción
  DRAG_SENSITIVITY: 2,           // mm por pixel
  TRANSITION_DURATION: 400,      // ms
  HINT_DURATION: 1500,           // ms

  // Envío
  SHIPPING_FACTORY_ADDRESS: 'Lugones 219, B1878 Quilmes, Buenos Aires',
  SHIPPING_CABA_AMBA_COST: 5000, // ARS flat rate (ajustar según necesidad)

  // Bounds del AMBA (para validar que la dirección cae dentro de la zona)
  AMBA_BOUNDS: {
    SW: { lat: -35.0, lng: -59.2 },  // Sudoeste
    NE: { lat: -34.3, lng: -58.1 },  // Nordeste
  },
};

/**
 * Como se enuncian los minimos, en un solo lugar.
 *
 * Habia seis textos distintos declarando "pedido minimo 3.000 m²" sin nombrar
 * el canal de stock. No era falso, pero era la mitad de la verdad, y la mitad
 * que espanta: un comprador de 500 cajas leia eso y se descartaba solo.
 *
 * Paso de verdad en una prueba con ChatGPT: le dijo a un cliente de 4.000
 * cajas "tu pedido probablemente este por debajo de ese minimo", cuando tenia
 * dos caminos disponibles. La frase corta espantaba una venta real.
 *
 * Nombrar los dos canales cuesta seis palabras mas y cambia quien se queda.
 */
export const MINIMOS = {
  /** Para metadatos y descripciones cortas. */
  corto: `desde ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón`,
  /** Para respuestas y textos donde hay lugar para explicar. */
  largo:
    `El mínimo de compra es de ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón. Se mide en ` +
    `superficie y no en cantidad de cajas, porque lo que limita es cuánto cartón entra en una ` +
    `tirada: cien cajas grandes y mil chicas pueden ser el mismo pedido para la máquina. ` +
    `Entre ${RETAIL_CONFIG.MIN_M2_PEDIDO} y ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² ` +
    `trabajamos con medidas estándar de catálogo, sin impresión. Desde ` +
    `${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² fabricamos la medida que ` +
    `necesites, con impresión hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores.`,
  /**
   * La regla que mas consultas evita. Va en las paginas de producto y en el
   * cotizador: sin esto llegaban pedidos de cajas troqueladas por 50 unidades.
   */
  personalizadas:
    `Las cajas a medida, troqueladas o con impresión se fabrican desde ` +
    `${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² de cartón. Por debajo de ese ` +
    `volumen trabajamos con medidas estándar de catálogo.`,
} as const;

/**
 * Como se enuncian las condiciones de envio, en un solo lugar.
 *
 * Catorce textos decian "envio gratis hasta 60 km" sin mencionar que ese
 * beneficio arranca en 3.000 m². Le estabamos prometiendo envio sin cargo a
 * un comprador minorista de 100 cajas que en realidad tiene que retirar por
 * fabrica o pagarse el flete.
 *
 * Es el peor tipo de error comercial: no espanta al cliente, lo atrae con una
 * condicion que despues hay que desmentir cuando ya decidio comprar. Y en las
 * superficies que lee un asistente de IA se repite como dato verificado.
 */
/**
 * El papel con el que se fabrica. Es una pregunta que hace todo comprador
 * tecnico y hasta ahora no estaba escrita en ningun lado del sitio.
 *
 * HOY HAY UN SOLO GRAMAJE, y por eso vive aca como constante. Cuando se
 * comercialice mas de uno con precios distintos, esto se muda a
 * pricing_config: el gramaje va a pasar a ser una variable del precio, igual
 * que el volumen, y tiene que poder cambiarse desde el panel sin deployar.
 *
 * Mientras tanto los textos dicen "hoy trabajamos" y no "fabricamos
 * unicamente": afirmar exclusividad sobre algo que esta por dejar de ser
 * exclusivo es fabricar una contradiccion con fecha.
 */
// El gramaje decía "100 libras" pero el estándar que cotiza la web es de 90:
// lo confirmó Julián el 26-08-2026, después de que Florencia se lo dijera a un
// cliente por WhatsApp y los dos números quedaran conviviendo.
export const MATERIAL = {
  gramaje: '90 libras',
  /** Frase completa, para una lista de condiciones. */
  descripcion: 'Cartón corrugado kraft de 90 libras, onda simple.',
  /** Solo el papel, para meter en una oración que ya dijo "cartón corrugado". */
  detalle: 'kraft de 90 libras, onda simple',
  /** Deja la puerta abierta sin prometer nada que hoy no exista. */
  nota:
    'El estándar que cotiza la web es cartón kraft de 90 libras, onda simple. ' +
    'También trabajamos materiales reforzados (onda triple y otras calidades), ' +
    'que se cotizan aparte: consultanos y lo vemos.',
} as const;

/**
 * Horario de atencion.
 *
 * Estaba escrito en quince lugares en dos versiones que no coincidian: el bot
 * de WhatsApp, el llms.txt, el parser de mails y el prompt de la IA decian
 * 7 a 16, y el sitio y el JSON-LD decian 8 a 17.
 *
 * El correcto es 7 a 16, confirmado por el dueño el 19/08/2026. La ficha de
 * Google Business ya lo tenia bien; lo que estaba mal era el sitio.
 */
export const HORARIO = {
  desde: 7,
  hasta: 16,
  /** 0 = domingo. */
  dias: [1, 2, 3, 4, 5],
  /** Para paginas y respuestas al cliente. */
  texto: 'Lunes a viernes de 7:00 a 16:00 hs',
  /** Para firmas y pies de mensaje, donde el lugar es poco. */
  corto: 'Lunes a Viernes 7:00 - 16:00',
  /** Formato de schema.org, para el JSON-LD de LocalBusiness. */
  schema: 'Mo-Fr 07:00-16:00',
} as const;

export const ENVIO = {
  /** Para meta descriptions y otros lugares con limite duro de caracteres. */
  micro: `gratis desde ${RETAIL_CONFIG.ENVIO_GRATIS_MIN_M2.toLocaleString('es-AR')} m²`,
  /** Para resumenes y fichas, donde entra la condicion completa. */
  corto: `gratis desde ${RETAIL_CONFIG.ENVIO_GRATIS_MIN_M2.toLocaleString('es-AR')} m² dentro de ${RETAIL_CONFIG.ENVIO_GRATIS_KM} km de Quilmes; pedidos menores, retiro en fábrica o envío a cargo del comprador`,
  /** Para respuestas y donde hay lugar para explicar. */
  largo:
    `Depende del tamaño del pedido. En pedidos mayoristas, desde ` +
    `${RETAIL_CONFIG.ENVIO_GRATIS_MIN_M2.toLocaleString('es-AR')} m², el envío es gratis dentro de un radio de ` +
    `${RETAIL_CONFIG.ENVIO_GRATIS_KM} km de la fábrica en Quilmes, que cubre la zona sur del Gran Buenos Aires, ` +
    `CABA y La Plata. En pedidos minoristas el retiro es en la fábrica, o coordinamos el envío con el ` +
    `costo a cargo del comprador. Para destinos más lejanos o al interior del país, el flete se cotiza ` +
    `aparte en ambos casos.`,
} as const;
