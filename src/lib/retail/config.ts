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
  MIN_CANTIDAD: 100,              // El canal minorista vende desde 100 cajas

  // Minimo de una tirada a medida. Espeja pricing_config.min_m2_per_model.
  // Existe como constante porque los metadatos y el JSON-LD son estaticos y no
  // pueden leer la base.
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
  corto: `desde ${RETAIL_CONFIG.MIN_CANTIDAD} cajas de stock o ${RETAIL_CONFIG.MIN_M2_A_MEDIDA.toLocaleString('es-AR')} m² a medida`,
  /** Para respuestas y textos donde hay lugar para explicar. */
  largo:
    `Depende del canal. Si la medida está en catálogo, se compra de stock desde ` +
    `${RETAIL_CONFIG.MIN_CANTIDAD} cajas, con entrega en 24 a 48 horas. Si querés una medida ` +
    `propia fabricada a pedido, el mínimo es de ${RETAIL_CONFIG.MIN_M2_A_MEDIDA.toLocaleString('es-AR')} m² ` +
    `de cartón por modelo, que son entre 1.000 y 5.000 cajas según el tamaño: por ejemplo, una ` +
    `caja de 400x300x300 mm requiere unas 2.800 unidades.`,
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
 * Horario de atencion. Estaba escrito en quince lugares en dos versiones que no
 * coincidian: el sitio y el JSON-LD decian 8 a 17, y el bot de WhatsApp, el
 * llms.txt, el parser de mails y el prompt de la IA decian 7 a 16. O sea que a
 * las 7:30 el bot atendia como si estuviera abierto y a las 16:30 mandaba a la
 * gente a dejar un mensaje estando la fabrica abierta.
 *
 * El horario correcto es 8 a 17. El JSON-LD ya lo tenia bien, asi que Google
 * nunca mostro el equivocado.
 */
/**
 * El papel con el que se fabrica. Es una pregunta que hace todo comprador
 * tecnico y hasta ahora no estaba escrita en ningun lado del sitio.
 */
export const MATERIAL = {
  gramaje: '100 libras',
  descripcion: 'Cartón corrugado de 100 libras, kraft.',
} as const;

export const HORARIO = {
  desde: 8,
  hasta: 17,
  /** 0 = domingo. */
  dias: [1, 2, 3, 4, 5],
  /** Para paginas y respuestas al cliente. */
  texto: 'Lunes a viernes de 8:00 a 17:00 hs',
  /** Para firmas y pies de mensaje, donde el lugar es poco. */
  corto: 'Lunes a Viernes 8:00 - 17:00',
  /** Formato de schema.org, para el JSON-LD de LocalBusiness. */
  schema: 'Mo-Fr 08:00-17:00',
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
