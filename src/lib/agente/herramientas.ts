import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActivePricingConfig } from '@/lib/utils/pricing';
import { calcularCotizacion, precioUnitarioARS, urlPlantilla, notaImpresion } from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG, MINIMOS, ENVIO, HORARIO } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import { SITE_URL } from '@/lib/site';

/**
 * Las herramientas del agente de ventas.
 *
 * POR QUE ESTAN ACA Y NO EN EL PROMPT
 *
 * Durante meses el chat tuvo escrito en el prompt "NUNCA inventes precios
 * exactos". Medido contra la API, los tres modelos que probamos inventaron uno
 * igual: $130, $120 y "$ X por caja". Pedirle a un modelo que no invente es una
 * instruccion; darle una funcion que devuelve el numero es una garantia.
 *
 * Por eso el prompt de sistema de este agente es corto y no lleva ni precios ni
 * minimos ni plazos: todo eso se pregunta acá. Un dato que no esta en el prompt
 * no se puede desactualizar en el prompt.
 *
 * Todas leen del mismo motor y de la misma config que la web, la API publica y
 * el servidor MCP. Es el punto del ejercicio: una sola fuente, cuatro consumos.
 */

async function leerCatalogoDeStock() {
  try {
    const { data } = await createAdminClient()
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);
    return data || [];
  } catch {
    // Sin catalogo el motor asume produccion a medida, que es la promesa mas
    // conservadora: nunca ofrece una entrega en 48 horas que no se pueda dar.
    return [];
  }
}

export const cotizarCajas = betaTool({
  name: 'cotizar_cajas',
  description:
    'Calcula el precio real de un pedido de cajas de cartón corrugado. Es la ÚNICA ' +
    'fuente válida de precios: nunca estimes ni calcules un precio por tu cuenta. ' +
    'Las medidas van en milímetros. Si la persona las dio en centímetros, ' +
    'multiplicá por 10 antes de llamar. Devuelve el precio por caja, el subtotal ' +
    'sin IVA, el IVA, el total, el plazo de entrega, la validez y un link ' +
    'compartible con la cotización.',
  inputSchema: {
    type: 'object',
    properties: {
      largo_mm: { type: 'integer', description: 'Largo de la caja en milímetros' },
      ancho_mm: { type: 'integer', description: 'Ancho de la caja en milímetros' },
      alto_mm: { type: 'integer', description: 'Alto de la caja en milímetros' },
      cantidad: { type: 'integer', description: 'Cantidad de cajas' },
      colores_impresion: {
        type: 'integer',
        description:
          'Cantidad de colores de impresión flexográfica, de 0 a 3. Usá 0 si la ' +
          'persona no pidió impresión o dijo que la quiere lisa. Si pidió ' +
          'impresión pero no dijo cuántos colores, preguntale antes de llamar.',
      },
    },
    required: ['largo_mm', 'ancho_mm', 'alto_mm', 'cantidad', 'colores_impresion'],
    additionalProperties: false,
  },
  run: async (args) => {
    const { largo_mm, ancho_mm, alto_mm, cantidad, colores_impresion } = args;

    // Las validaciones van acá y no en el prompt: un limite de fabricacion que
    // el modelo tiene que recordar es un limite que alguna vez va a olvidar.
    const problemas: string[] = [];
    if (cantidad < RETAIL_CONFIG.MIN_CANTIDAD) {
      problemas.push(
        `La cantidad mínima es ${RETAIL_CONFIG.MIN_CANTIDAD} cajas y pediste ${cantidad.toLocaleString('es-AR')}.`,
      );
    }
    if (ancho_mm + alto_mm > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      problemas.push(
        `No se puede fabricar: ancho + alto es ${ancho_mm + alto_mm} mm y el ancho ` +
          `máximo de plancha es ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el límite del rollo.`,
      );
    }
    if (largo_mm < RETAIL_CONFIG.MIN_LARGO || ancho_mm < RETAIL_CONFIG.MIN_ANCHO || alto_mm < RETAIL_CONFIG.MIN_ALTO) {
      problemas.push(
        `La medida mínima por caja es ${RETAIL_CONFIG.MIN_LARGO}x${RETAIL_CONFIG.MIN_ANCHO}x${RETAIL_CONFIG.MIN_ALTO} mm.`,
      );
    }
    if (colores_impresion > RETAIL_CONFIG.MAX_PRINTING_COLORS) {
      problemas.push(
        `Imprimimos hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores y pediste ${colores_impresion}.`,
      );
    }
    if (problemas.length) {
      return JSON.stringify({
        se_puede_cotizar: false,
        motivos: problemas,
        instruccion: 'Explicale el motivo concreto a la persona y ofrecele una alternativa.',
      });
    }

    const config = await getActivePricingConfig();
    if (!config) {
      return JSON.stringify({
        se_puede_cotizar: false,
        motivos: ['No se pudo leer la configuración de precios.'],
        instruccion:
          'Decile que hay un problema técnico con los precios y ofrecele hablar por WhatsApp. No inventes un precio.',
      });
    }

    const q = calcularCotizacion(
      [{
        length_mm: largo_mm,
        width_mm: ancho_mm,
        height_mm: alto_mm,
        quantity: cantidad,
        printing_colors: colores_impresion,
      }],
      config,
      await leerCatalogoDeStock(),
    );
    const caja = q.boxes[0];

    return JSON.stringify({
      se_puede_cotizar: true,
      medidas_mm: `${largo_mm}x${ancho_mm}x${alto_mm}`,
      cantidad,
      colores_impresion: caja.printing_colors,
      precio_por_caja: precioUnitarioARS(caja.unit_price),
      subtotal_sin_iva: Math.round(q.subtotal),
      iva_21: Math.round(q.tax_amount),
      total_con_iva: Math.round(q.total_with_tax),
      moneda: 'ARS',
      metros_cuadrados: q.total_m2,
      precio_por_m2: caja.price_per_m2,
      dias_habiles_entrega: q.estimated_days,
      valido_hasta: q.valid_until,
      canal: q.channel,
      nota_del_canal: q.channel_note,
      impresion_disponible: q.printing.available,
      link_para_compartir: `${SITE_URL}/cotizar/${largo_mm}x${ancho_mm}x${alto_mm}/${cantidad}`,
      instruccion:
        'Al dar el precio decí siempre que es en pesos, que el subtotal va sin IVA y ' +
        'el total con IVA incluido, el plazo y hasta cuándo vale. Pasale el link.',
    });
  },
});

export const condicionesYPrecios = betaTool({
  name: 'condiciones_y_precios',
  description:
    'Devuelve las condiciones comerciales vigentes: mínimos de cada canal, escalera ' +
    'de precios por m², límites de fabricación, impresión, envío, plazos, horario y ' +
    'datos de contacto. Consultala cuando pregunten por mínimos, envíos, plazos, ' +
    'formas de contacto o rangos de precio. No respondas esas cosas de memoria.',
  inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  run: async () => {
    const c = await getActivePricingConfig();
    return JSON.stringify({
      minimos: {
        minorista_cajas: RETAIL_CONFIG.MIN_CANTIDAD,
        mayorista_m2_por_modelo: RETAIL_CONFIG.MIN_M2_A_MEDIDA,
        explicacion: MINIMOS.largo,
      },
      precios_por_m2_sin_iva: c
        ? {
            volumen: c.price_per_m2_volume,
            estandar: c.price_per_m2_standard,
            minorista: c.price_per_m2_retail,
            umbral_volumen_m2: c.volume_threshold_m2,
            nota: 'El precio se calcula por m² de cartón desplegado, no por el volumen de la caja.',
          }
        : null,
      iva: 'Los precios publicados van sin IVA. El IVA es 21% y se informa aparte.',
      impresion: c
        ? {
            max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS,
            tecnica: 'flexografía',
            como_se_cobra: notaImpresion(c),
            incluida_desde_m2: c.printing_included_min_m2,
            polimero: 'Se cotiza aparte, va a cargo del comprador y depende del diseño. No lo estimes.',
          }
        : null,
      limites_de_fabricacion: {
        medida_minima_mm: `${RETAIL_CONFIG.MIN_LARGO}x${RETAIL_CONFIG.MIN_ANCHO}x${RETAIL_CONFIG.MIN_ALTO}`,
        ancho_mas_alto_max_mm: RETAIL_CONFIG.MAX_SHEET_WIDTH,
        motivo: 'Es el ancho del rollo de cartón.',
      },
      envio: ENVIO.largo,
      plazos: c
        ? {
            sin_impresion_dias_habiles: c.production_days_standard,
            con_impresion_dias_habiles: c.production_days_printing,
            stock: '24 a 48 horas',
          }
        : null,
      validez_cotizacion_dias: c?.quote_validity_days ?? 7,
      horario: HORARIO.texto,
      contacto: {
        whatsapp: CONTACTO.telefonoVisible,
        email: CONTACTO.email,
        direccion: CONTACTO.direccion,
      },
      solo_argentina: true,
    });
  },
});

export const plantillaDeImpresion = betaTool({
  name: 'plantilla_impresion',
  description:
    'Devuelve el link al PDF del desplegado de la caja, con las líneas de corte y ' +
    'plegado y las áreas donde va el diseño. Es lo que el diseñador necesita para ' +
    'armar el arte sobre la medida real. Usala cuando pidan la plantilla, el ' +
    'desplegado, el troquel o cómo mandar el diseño.',
  inputSchema: {
    type: 'object',
    properties: {
      largo_mm: { type: 'integer' },
      ancho_mm: { type: 'integer' },
      alto_mm: { type: 'integer' },
    },
    required: ['largo_mm', 'ancho_mm', 'alto_mm'],
    additionalProperties: false,
  },
  run: async ({ largo_mm, ancho_mm, alto_mm }) => {
    return JSON.stringify({
      pdf: urlPlantilla(largo_mm, ancho_mm, alto_mm),
      max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS,
      como_funciona:
        'Las áreas verdes marcan dónde va el diseño. Se puede mandar el arte terminado ' +
        'en PDF, AI o EPS por WhatsApp o por mail.',
    });
  },
});

export const guardarLead = betaTool({
  name: 'guardar_lead',
  description:
    'Guarda los datos de la persona para que un vendedor la contacte. Llamala ' +
    'cuando deje su nombre, empresa, mail o teléfono, o cuando pida que la ' +
    'contacten. No hace falta tener todos los datos: guardá lo que haya. Llamala ' +
    'una sola vez por conversación, salvo que agregue datos nuevos.',
  inputSchema: {
    type: 'object',
    properties: {
      nombre: { type: 'string', description: 'Nombre de la persona, si lo dijo' },
      empresa: { type: 'string', description: 'Empresa, si la dijo' },
      email: { type: 'string', description: 'Email, si lo dejó' },
      telefono: { type: 'string', description: 'Teléfono, si lo dejó' },
      resumen: {
        type: 'string',
        description:
          'Una o dos frases con lo que necesita: medidas, cantidad, uso, urgencia. ' +
          'Es lo que va a leer el vendedor antes de llamar.',
      },
    },
    required: ['resumen'],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      // Service role: no hay sesion de usuario en un endpoint publico, y con el
      // cliente SSR las policies de RLS rechazan el insert en silencio. Ya paso
      // con los leads de WhatsApp, que se perdieron todos.
      const { error } = await createAdminClient().from('public_quotes').insert({
        requester_name: args.nombre || args.empresa || 'Consulta del chat',
        requester_company: args.empresa || null,
        requester_email: args.email || null,
        requester_phone: args.telefono || null,
        message: args.resumen,
        source: 'chat_web',
        requested_contact: true,
        status: 'pending',
      });
      if (error) {
        console.error('[Agente] No se pudo guardar el lead:', error);
        return JSON.stringify({
          guardado: false,
          instruccion:
            'No se pudo guardar. Pedile que escriba por WhatsApp así no se pierde la consulta.',
        });
      }
      return JSON.stringify({
        guardado: true,
        instruccion: 'Confirmale que un vendedor la va a contactar y en qué horario se atiende.',
      });
    } catch (e) {
      console.error('[Agente] No se pudo guardar el lead:', e);
      return JSON.stringify({ guardado: false, instruccion: 'Ofrecele WhatsApp.' });
    }
  },
});

export const derivarAHumano = betaTool({
  name: 'derivar_a_humano',
  description:
    'Devuelve el link de WhatsApp con un mensaje ya escrito para seguir la ' +
    'conversación con una persona del equipo. Usala cuando pidan hablar con ' +
    'alguien, cuando la consulta se te vaya de lo que podés resolver, o cuando ' +
    'haya un reclamo.',
  inputSchema: {
    type: 'object',
    properties: {
      contexto: {
        type: 'string',
        description:
          'El mensaje que va a llegarle al equipo, escrito en primera persona como ' +
          'si lo mandara la persona. Incluí medidas, cantidad y precio si ya se ' +
          'cotizó, para que no tenga que contar todo de nuevo.',
      },
    },
    required: ['contexto'],
    additionalProperties: false,
  },
  run: async ({ contexto }) => {
    return JSON.stringify({
      whatsapp: CONTACTO.whatsappCon(contexto),
      telefono: CONTACTO.telefonoVisible,
      email: CONTACTO.email,
      horario: HORARIO.texto,
      instruccion: 'Pasale el link tal cual: ya lleva el mensaje escrito.',
    });
  },
});

export const HERRAMIENTAS = [
  cotizarCajas,
  condicionesYPrecios,
  plantillaDeImpresion,
  guardarLead,
  derivarAHumano,
];
