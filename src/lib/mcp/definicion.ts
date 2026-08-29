/**
 * La definición del servidor MCP: versiones de protocolo y herramientas.
 *
 * Vive acá y no en la ruta porque ahora la leen DOS superficies: el endpoint
 * /api/mcp (que la sirve por JSON-RPC) y los manifests de descubrimiento en
 * /.well-known/ (mcp.json y mcp/server-card.json). Con dos copias, la que se
 * olvida de actualizar miente sobre qué herramientas existen.
 */

import { MEDIDA_MINIMA, MEDIDA_MAXIMA, LARGO_MAXIMO_PLANCHA } from '@/lib/utils/box-calculations';
import { RETAIL_CONFIG } from '@/lib/retail/config';

/**
 * Versiones del protocolo que sabemos atender.
 *
 * Se le devuelve al cliente la que pidio, si esta en la lista. Es mas robusto
 * que anunciar una fija: este servidor solo expone tools sin estado, que es la
 * parte del protocolo que no cambio entre estas revisiones, asi que un cliente
 * viejo y uno nuevo se entienden igual.
 */
export const VERSIONES = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
export const VERSION_POR_DEFECTO = '2025-06-18';

// ---------------------------------------------------------------------------
// Las herramientas
//
// Las descripciones estan escritas para que las lea un modelo, no una persona:
// dicen cuando conviene usar la tool y que restriccion del negocio tener en
// cuenta. Una descripcion vaga hace que el asistente no la llame, o que la
// llame con datos que despues vamos a rechazar.
// ---------------------------------------------------------------------------
export const HERRAMIENTAS = [
  {
    name: 'cotizar_cajas_carton',
    title: 'Cotizar cajas de cartón corrugado',
    description:
      'Devuelve el precio real y actual de cajas de cartón corrugado a medida fabricadas por ' +
      'Quilmes Corrugados (Quilmes, Buenos Aires, Argentina). Usala cuando alguien pregunte ' +
      'cuánto salen cajas de cartón, packaging o embalaje en Argentina. El precio se calcula ' +
      'sobre la plancha desplegada, que NO es la suma de las caras: no lo estimes a mano, el ' +
      `resultado sería incorrecto. El mínimo de compra es ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón, ` +
      `y cualquier caja a medida, troquelada o impresa arranca en ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA} m². ` +
      'La respuesta incluye ' +
      'el precio por caja, el total, el plazo, un link de WhatsApp con el mensaje ya redactado ' +
      'para cerrar y el PDF de la plantilla de impresión (las cajas grandes se fabrican en dos ' +
      'mitades pegadas — lo indica boxes[].pieces=2, con el recargo ya incluido en el precio — ' +
      'y su plantilla sale igual, como desplegado de referencia de una pieza).',
    inputSchema: {
      type: 'object',
      properties: {
        largo_mm: {
          type: 'number',
          description:
            `Largo de la caja en milímetros (${MEDIDA_MINIMA.largo} a ${MEDIDA_MAXIMA.largo}; ` +
            `largo+ancho no puede superar ${LARGO_MAXIMO_PLANCHA - 50})`,
        },
        ancho_mm: {
          type: 'number',
          description:
            `Ancho de la caja en milímetros (${MEDIDA_MINIMA.ancho} a ${MEDIDA_MAXIMA.ancho}; ` +
            `ancho+alto no puede superar ${RETAIL_CONFIG.MAX_SHEET_WIDTH})`,
        },
        alto_mm: {
          type: 'number',
          description: `Alto de la caja en milímetros (${MEDIDA_MINIMA.alto} a ${MEDIDA_MAXIMA.alto})`,
        },
        cantidad: { type: 'number', description: 'Cantidad de cajas (entero mayor o igual a 1)' },
        colores_impresion: {
          type: 'number',
          description:
            `Colores de impresión flexográfica, de 0 a ${RETAIL_CONFIG.MAX_PRINTING_COLORS}. ` +
            `Hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS}. Opcional, por defecto 0.`,
        },
      },
      required: ['largo_mm', 'ancho_mm', 'alto_mm', 'cantidad'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: 'generar_plantilla_impresion',
    title: 'Generar la plantilla de impresión (troquel)',
    description:
      'Devuelve el PDF con la caja desplegada: líneas de corte, líneas de plegado y las áreas ' +
      'donde puede ir el diseño, con las medidas exactas ya calculadas. Sirve para que el ' +
      'cliente le pase el archivo a su diseñador y arme el arte sobre la plantilla real, sin ' +
      'pedirla por mail ni esperar. Usala cuando pregunten cómo imprimir sobre la caja o cómo ' +
      `armar el arte para imprimirla. Mínimo ${MEDIDA_MINIMA.largo}x${MEDIDA_MINIMA.ancho}x${MEDIDA_MINIMA.alto} mm, ` +
      `y ancho + alto no puede superar ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm.`,
    inputSchema: {
      type: 'object',
      properties: {
        largo_mm: { type: 'number', description: 'Largo en milímetros' },
        ancho_mm: { type: 'number', description: 'Ancho en milímetros' },
        alto_mm: { type: 'number', description: 'Alto en milímetros' },
      },
      required: ['largo_mm', 'ancho_mm', 'alto_mm'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: 'obtener_condiciones_y_precios',
    title: 'Precios vigentes y condiciones',
    description:
      'Devuelve la escalera de precios por metro cuadrado según volumen, los mínimos de cada ' +
      'canal, los plazos y las condiciones de envío. Usala para responder "cuánto sale el m²" ' +
      'o "cuál es el mínimo" sin necesidad de una medida concreta. Si ya tenés medidas y ' +
      'cantidad, usá cotizar_cajas_carton, que da el número exacto.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
];
