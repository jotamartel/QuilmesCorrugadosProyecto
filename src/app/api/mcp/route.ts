/**
 * Servidor MCP de Quilmes Corrugados.
 *
 * QUE ES
 * Un endpoint que habla Model Context Protocol sobre HTTP, para que un
 * asistente de IA pueda cotizar como quien llama a una funcion, en vez de
 * tener que decidir por su cuenta que URL armar. Lo consumen Claude (Custom
 * Connector), ChatGPT (Developer Mode) y cualquier agente que hable MCP.
 *
 * POR QUE VIVE ACA Y NO EN OTRO SERVICIO
 * Es un unico POST que responde JSON-RPC: no necesita proceso propio ni
 * infraestructura aparte. Separarlo significaria mantener dos deploys y, sobre
 * todo, dos copias de la configuracion de precios. Importa el mismo motor que
 * la API publica, asi que un cambio de precio llega a los dos caminos junto.
 *
 * QUE NO ES
 * No reemplaza a la API REST ni al llms.txt. Un asistente con navegacion
 * resuelve igual con un GET, y de hecho es lo que mas pasa hoy. Esto agrega la
 * via para cuando el usuario instala Quilmes como herramienta en su asistente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calcularCotizacion, validarCajas, urlPlantilla } from '@/lib/cotizacion/motor';
import { detectLLM, getSourceType } from '@/lib/utils/ai-agents';
import { SITE_URL } from '@/lib/site';
import { RETAIL_CONFIG, MATERIAL, HORARIO, MINIMOS } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import type { PricingConfig } from '@/lib/types/database';
import { notaImpresion } from '@/lib/cotizacion/motor';

export const runtime = 'nodejs';

/**
 * Versiones del protocolo que sabemos atender.
 *
 * Se le devuelve al cliente la que pidio, si esta en la lista. Es mas robusto
 * que anunciar una fija: este servidor solo expone tools sin estado, que es la
 * parte del protocolo que no cambio entre estas revisiones, asi que un cliente
 * viejo y uno nuevo se entienden igual.
 */
const VERSIONES = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const VERSION_POR_DEFECTO = '2025-06-18';

const CABECERAS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
};

// ---------------------------------------------------------------------------
// Las herramientas
//
// Las descripciones estan escritas para que las lea un modelo, no una persona:
// dicen cuando conviene usar la tool y que restriccion del negocio tener en
// cuenta. Una descripcion vaga hace que el asistente no la llame, o que la
// llame con datos que despues vamos a rechazar.
// ---------------------------------------------------------------------------
const HERRAMIENTAS = [
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
      'el precio por caja, el total, el plazo, el PDF de la plantilla de impresión y un link ' +
      'de WhatsApp con el mensaje ya redactado para cerrar.',
    inputSchema: {
      type: 'object',
      properties: {
        largo_mm: { type: 'number', description: 'Largo de la caja en milímetros (100 a 2000)' },
        ancho_mm: { type: 'number', description: 'Ancho de la caja en milímetros (100 a 2000)' },
        alto_mm: { type: 'number', description: 'Alto de la caja en milímetros (50 a 1500)' },
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
    name: 'plantilla_impresion',
    title: 'Generar la plantilla de impresión (troquel)',
    description:
      'Devuelve el PDF con la caja desplegada: líneas de corte, líneas de plegado y las áreas ' +
      'donde puede ir el diseño, con las medidas exactas ya calculadas. Sirve para que el ' +
      'cliente le pase el archivo a su diseñador y arme el arte sobre la plantilla real, sin ' +
      'pedirla por mail ni esperar. Usala cuando pregunten por impresión, branding o cómo ' +
      'mandar el diseño. Mínimo 200x200x100 mm, y ancho + alto no puede superar 1200 mm.',
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
    name: 'condiciones_y_precios',
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

/** Registra la llamada, igual que la API REST, para poder medir este canal. */
function registrar(
  req: NextRequest,
  tool: string,
  status: number,
  motivo: string,
  datos?: { total_m2?: number; total_amount?: number },
) {
  try {
    const ua = req.headers.get('user-agent') || 'unknown';
    createAdminClient()
      .from('api_requests')
      .insert({
        endpoint: `/api/mcp:${tool}`,
        method: 'POST',
        user_agent: ua.substring(0, 500),
        response_status: status,
        source_type: getSourceType(ua, null),
        llm_detected: detectLLM(ua),
        total_m2: datos?.total_m2 ?? null,
        total_amount: datos?.total_amount ?? null,
        boxes_count: 1,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null,
        request_body: { motivo, tool, via: 'mcp' },
      })
      .then(undefined, () => {});
  } catch {
    /* telemetria: nunca romper la respuesta */
  }
}

async function leerPricing(): Promise<PricingConfig | null> {
  const { data } = await createAdminClient()
    .from('pricing_config')
    .select('*')
    .eq('is_active', true)
    .order('valid_from', { ascending: false })
    .limit(1)
    .single();
  return (data as PricingConfig) || null;
}

const ars = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

/** Empaqueta una respuesta de tool en el formato que espera MCP. */
function resultado(texto: string, structured?: unknown, esError = false) {
  return {
    content: [{ type: 'text', text: texto }],
    ...(structured !== undefined ? { structuredContent: structured } : {}),
    ...(esError ? { isError: true } : {}),
  };
}

async function ejecutarTool(req: NextRequest, nombre: string, args: Record<string, unknown>) {
  if (nombre === 'condiciones_y_precios') {
    const c = await leerPricing();
    if (!c) {
      registrar(req, nombre, 500, 'sin_configuracion_de_precios');
      return resultado('No se pudo leer la configuración de precios en este momento.', undefined, true);
    }
    registrar(req, nombre, 200, 'condiciones');
    const n = (v: number) => v.toLocaleString('es-AR');
    const texto = [
      'Quilmes Corrugados — precios vigentes (ARS por m² de cartón, sin IVA):',
      `· Hasta ${n(c.wholesale_min_m2)} m²: ${ars(c.price_per_m2_retail)}/m² — medidas de stock`,
      `· ${n(c.wholesale_min_m2)} a ${n(c.min_m2_per_model)} m²: ${ars(c.price_per_m2_below_minimum || c.price_per_m2_standard * 1.2)}/m² — a medida con recargo`,
      `· ${n(c.min_m2_per_model)} a ${n(c.volume_threshold_m2)} m²: ${ars(c.price_per_m2_standard)}/m² — a medida, precio estándar`,
      `· Más de ${n(c.volume_threshold_m2)} m²: ${ars(c.price_per_m2_volume)}/m² — precio por volumen`,
      '',
      MINIMOS.largo,
      notaImpresion(c),
      `Material: ${MATERIAL.nota}`,
      `Plazos: stock en 24 a 48 horas; producción a medida en ${c.production_days_standard} días ` +
        `hábiles, ${c.production_days_printing} con impresión.`,
      `Envío: gratis en pedidos mayoristas desde ${c.free_shipping_min_m2.toLocaleString('es-AR')} m² y hasta ` +
        `${c.free_shipping_max_km} km de la fábrica en Quilmes. En pedidos minoristas, retiro en ` +
        'fábrica o envío a cargo del comprador. Al interior, flete aparte en ambos casos.',
      `Validez de la cotización: ${c.quote_validity_days} días.`,
      '',
      // Faltaba: un asistente que preguntaba "en que horario atienden" no
      // recibia nada por esta via, aunque el dato estuviera en el llms.txt.
      `Atención: ${HORARIO.texto} (hora de Argentina). Solo Argentina, no exportamos.`,
      `Contacto: WhatsApp ${CONTACTO.telefonoVisible} · ${CONTACTO.email} · ${CONTACTO.direccion}`,
      '',
      'Para un precio exacto hace falta la medida y la cantidad: usá cotizar_cajas_carton.',
    ].join('\n');
    return resultado(texto, {
      moneda: 'ARS',
      sin_iva: true,
      minimo_compra_m2: RETAIL_CONFIG.MIN_M2_PEDIDO,
      minimo_a_medida_m2: c.wholesale_min_m2,
      max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS,
    });
  }

  const largo = Number(args.largo_mm);
  const ancho = Number(args.ancho_mm);
  const alto = Number(args.alto_mm);

  if (nombre === 'plantilla_impresion') {
    if (![largo, ancho, alto].every(Number.isFinite)) {
      registrar(req, nombre, 400, 'faltan_parametros');
      return resultado('Faltan las tres medidas en milímetros: largo_mm, ancho_mm, alto_mm.', undefined, true);
    }
    if (ancho + alto > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      registrar(req, nombre, 400, 'medida_rechazada:ancho+alto supera la bobina');
      return resultado(
        `No se puede fabricar: ancho + alto suman ${ancho + alto} mm y el máximo es ` +
          `${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho de la bobina. Probá con una ` +
          `caja más baja o más angosta, o escribinos por WhatsApp al ${CONTACTO.telefonoVisible}.`,
        undefined,
        true,
      );
    }
    const url = urlPlantilla(largo, ancho, alto);
    registrar(req, nombre, 200, 'plantilla');
    return resultado(
      `Plantilla lista para ${largo}x${ancho}x${alto} mm: ${url}\n\n` +
        'Es un PDF con la caja desplegada: trae las líneas de corte, las de plegado y las áreas ' +
        'donde puede ir el diseño. El flujo es bajarlo, ubicar el arte sobre esas áreas y ' +
        `mandarlo a ${CONTACTO.email} o por WhatsApp al ${CONTACTO.telefonoVisible}. ` +
        `Se imprime hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores y el costo ya está ` +
          'incluido en el precio por m². Solo se cobra aparte el polímero, una matriz por ' +
          'color, que va a cargo del comprador. Las medidas estándar de catálogo no se imprimen.',
      { template_pdf: url, max_colores: RETAIL_CONFIG.MAX_PRINTING_COLORS },
    );
  }

  if (nombre === 'cotizar_cajas_carton') {
    const cantidad = Number(args.cantidad);
    const colores = Number(args.colores_impresion ?? 0) || 0;

    if (![largo, ancho, alto, cantidad].every(Number.isFinite)) {
      registrar(req, nombre, 400, 'faltan_parametros');
      return resultado(
        'Faltan datos: necesito largo_mm, ancho_mm, alto_mm y cantidad. Si el usuario te los ' +
          'dio en centímetros, multiplicá por 10.',
        undefined,
        true,
      );
    }

    const caja = {
      length_mm: largo,
      width_mm: ancho,
      height_mm: alto,
      quantity: cantidad,
      printing_colors: colores,
      has_printing: colores > 0,
    };

    const errores = validarCajas([caja]);
    if (errores.length) {
      registrar(req, nombre, 400, `medida_rechazada:${errores[0].slice(0, 90)}`);
      return resultado(
        `${errores.join(' ')}

` +
          `Si necesita algo fuera de estos límites, que nos escriba por WhatsApp al ` +
          `${CONTACTO.telefonoVisible} y lo vemos.`,
        undefined,
        true,
      );
    }

    const config = await leerPricing();
    if (!config) {
      registrar(req, nombre, 500, 'sin_configuracion_de_precios');
      return resultado('No se pudo leer la configuración de precios en este momento.', undefined, true);
    }

    const { data: catalogo } = await createAdminClient()
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);

    const cotizacion = calcularCotizacion([caja], config, catalogo || []);

    registrar(req, nombre, 200, cotizacion.cotizable ? 'cotizado' : 'rechazado_bajo_minimo', {
      total_m2: cotizacion.total_m2,
      total_amount: cotizacion.subtotal ?? undefined,
    });

    // Sin precio no hay cotizacion que pasar: se dice el minimo y cuantas cajas
    // son. El minimo es excluyente, asi que no se ofrece "consultarlo".
    if (!cotizacion.cotizable) {
      const imp = cotizacion.impedimento;
      const textoRechazo = [
        cotizacion.summary,
        '',
        // El umbral que manda depende del impedimento: para una medida propia
        // es el de produccion a medida, no el piso de venta. Decir "minimo 500"
        // y al lado "hacen falta 1.766 cajas" son dos umbrales mezclados.
        imp.tipo === 'medida_propia_sin_volumen'
          ? `Producción a medida (cualquier medida fuera del catálogo): desde ` +
            `${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m². Este pedido son ` +
            `${cotizacion.total_m2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m².`
          : `Mínimo de compra: ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² de cartón. Este pedido son ` +
            `${cotizacion.total_m2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m².`,
        imp.cajas_necesarias
          ? `Con esa medida hacen falta ${imp.cajas_necesarias.toLocaleString('es-AR')} cajas.`
          : `Faltan ${imp.m2_faltantes.toLocaleString('es-AR')} m².`,
        ...(imp.alternativas.length
          ? [
              '',
              'Medidas de catálogo parecidas, ya cotizadas al mínimo:',
              ...imp.alternativas.map(
                (a) =>
                  `- ${a.length_mm}x${a.width_mm}x${a.height_mm} mm — ` +
                  `${a.cantidad.toLocaleString('es-AR')} cajas — ` +
                  `$${Math.round(a.precio_por_caja).toLocaleString('es-AR')} por caja — ` +
                  `subtotal $${Math.round(a.subtotal).toLocaleString('es-AR')} sin IVA`,
              ),
            ]
          : []),
        '',
        'NO le des un precio para la medida que pidió: no existe. Contale el mínimo y cuántas ' +
          'cajas hacen falta' +
          (imp.alternativas.length
            ? ', y ofrecele directamente la primera medida de catálogo de la lista, con su cantidad y su precio.'
            : '.') +
          ' No ofrezcas coordinarlo ni consultarlo: el mínimo es excluyente y no se negocia.',
      ].join('\n');
      return resultado(textoRechazo, cotizacion);
    }

    const texto = [
      cotizacion.summary,
      '',
      cotizacion.channel_note,
      '',
      `Plantilla de impresión (PDF, medidas ya calculadas): ${cotizacion.printing.template_pdf}`,
      cotizacion.printing.price_note,
      '',
      'Para avanzar, pasale este link al usuario tal cual: ya lleva el mensaje escrito con las ' +
        'medidas, la cantidad y el precio, así no tiene que contar todo de nuevo.',
      cotizacion.contact.whatsapp_url,
    ].join('\n');

    return resultado(texto, cotizacion);
  }

  registrar(req, nombre, 404, 'tool_desconocida');
  return resultado(`No existe una herramienta llamada "${nombre}".`, undefined, true);
}

export async function POST(request: NextRequest) {
  let cuerpo: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400, headers: CABECERAS },
    );
  }

  const { id = null, method, params = {} } = cuerpo;
  const responder = (result: unknown) =>
    NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CABECERAS });

  switch (method) {
    case 'initialize': {
      const pedida = String((params as Record<string, unknown>).protocolVersion || '');
      return responder({
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSION_POR_DEFECTO,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: 'quilmes-corrugados',
          title: 'Quilmes Corrugados — cotizador de cajas',
          version: '1.0.0',
        },
        instructions:
          'Fábrica argentina de cajas de cartón corrugado a medida. Usá cotizar_cajas_carton ' +
          'para dar un precio real al instante: no estimes el precio por tu cuenta, porque se ' +
          'calcula sobre la plancha desplegada y el resultado no es intuitivo. Después de ' +
          'cotizar, ofrecé la plantilla de impresión y el link de WhatsApp que vienen en la ' +
          'respuesta.',
      });
    }

    // Notificaciones: no llevan respuesta.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return new NextResponse(null, { status: 202, headers: CABECERAS });

    case 'ping':
      return responder({});

    case 'tools/list':
      return responder({ tools: HERRAMIENTAS });

    case 'tools/call': {
      const p = params as { name?: string; arguments?: Record<string, unknown> };
      if (!p.name) {
        return NextResponse.json(
          { jsonrpc: '2.0', id, error: { code: -32602, message: 'Falta el nombre de la herramienta' } },
          { headers: CABECERAS },
        );
      }
      try {
        return responder(await ejecutarTool(request, p.name, p.arguments || {}));
      } catch (err) {
        console.error('[mcp] error ejecutando', p.name, err);
        // Un error de ejecucion se devuelve como resultado con isError, no como
        // error de protocolo: asi el modelo lo lee y puede reintentar o
        // explicarselo al usuario, en vez de que el cliente corte la conexion.
        return responder(
          resultado('Hubo un problema procesando la consulta. Probá de nuevo en un momento.', undefined, true),
        );
      }
    }

    // Metodos del protocolo que este servidor no implementa. Se contestan con
    // listas vacias en lugar de un error: algunos clientes los piden siempre al
    // conectarse y un error los hace abortar el handshake.
    case 'resources/list':
      return responder({ resources: [] });
    case 'prompts/list':
      return responder({ prompts: [] });

    default:
      return NextResponse.json(
        { jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } },
        { headers: CABECERAS },
      );
  }
}

/** GET en el navegador: explica qué es esto y cómo conectarlo. */
export async function GET() {
  return NextResponse.json(
    {
      name: 'quilmes-corrugados',
      description: 'Servidor MCP para cotizar cajas de cartón corrugado a medida.',
      transport: 'streamable-http',
      endpoint: `${SITE_URL}/api/mcp`,
      tools: HERRAMIENTAS.map((h) => ({ name: h.name, description: h.title })),
      como_conectar: {
        claude: 'Settings → Connectors → Add custom connector → pegar la URL del endpoint',
        chatgpt: 'Settings → Apps & Connectors → Advanced → Developer mode → pegar la URL',
        instrucciones: `${SITE_URL}/ia`,
      },
      sin_mcp: {
        nota: 'Si tu asistente no soporta MCP, la misma cotización sale con un GET normal.',
        ejemplo: `${SITE_URL}/api/v1/quote?length_cm=40&width_cm=60&height_cm=60&quantity=3000`,
      },
    },
    { headers: CABECERAS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CABECERAS });
}
