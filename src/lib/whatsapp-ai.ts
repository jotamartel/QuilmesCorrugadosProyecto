/**
 * IA conversacional para WhatsApp - Quilmes Corrugados
 * Genera respuestas detalladas usando el conocimiento del negocio
 */
import Groq from 'groq-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getActivePricingConfig,
  getPricePerM2,
} from '@/lib/utils/pricing';
import { MEDIDA_MINIMA, MEDIDA_MAXIMA, LARGO_MAXIMO_PLANCHA } from '@/lib/utils/box-calculations';
import { mensajeDeImpedimento } from '@/lib/cotizacion/motor';
import { SITE_URL } from '@/lib/site';
import { PAGO } from '@/lib/pagos/esquemas';
import { parseBoxDimensions, validateDimensions } from '@/lib/whatsapp';
import type { PricingConfig } from '@/lib/types/database';
import { HORARIO } from '@/lib/retail/config';
import { CONTACTO } from '@/lib/contacto';
import { completarConCascada, MODELOS_CONVERSACION } from '@/lib/groq-modelos';
import { calcularCotizacion, precioUnitarioARS } from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG } from '@/lib/retail/config';

/** El catálogo de stock, para que el motor sepa si el pedido sale ya o se fabrica. */
async function leerCatalogoDeStock() {
  try {
    const { data } = await createAdminClient()
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);
    return data || [];
  } catch {
    // Sin catálogo el motor asume producción a medida, que es la promesa más
    // conservadora: nunca promete una entrega en 48 horas que no se pueda dar.
    return [];
  }
}

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// El recargo por color se elimino el 19/08/2026: la impresion viene incluida
// en el precio por m² y solo se cobra el polimero. El calculo pasa por el motor.

/**
 * Config de precios de respaldo, para cuando la DB no responde (env vars, RLS).
 * Tiene que quedar ALINEADA con la fila activa de pricing_config: si se
 * desincroniza, el bot cotiza precios viejos justo cuando nadie lo esta mirando.
 * Ultima verificacion contra produccion: 2026-08-19 (precios nuevos).
 */
function getFallbackPricingConfig(): PricingConfig {
  return {
    id: 'fallback',
    price_per_m2_standard: 900,
    price_per_m2_volume: 800,
    volume_threshold_m2: 5000,
    min_m2_per_model: 3000,
    wholesale_min_m2: 1000,
    min_m2_pedido: 500,
    price_per_m2_below_minimum: 1000,
    price_per_m2_retail: 1200,
    printing_min_m2: 1000,
    printing_included_min_m2: 1000,
    printing_surcharge_per_color: 0,
    free_shipping_min_m2: 3000,
    free_shipping_max_km: 60,
    production_days_standard: 7,
    production_days_printing: 14,
    quote_validity_days: 7,
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: null,
    is_active: true,
    created_at: new Date().toISOString(),
  };
}

const BUSINESS_PHONE = process.env.WHATSAPP_BUSINESS_NUMBER || CONTACTO.telefonoVisible;

/** Prompt del sistema con todo el conocimiento del negocio */
const KNOWLEDGE_PROMPT = `Sos el asistente de WhatsApp de Quilmes Corrugados, una fábrica argentina de cajas de cartón corrugado en Quilmes, Buenos Aires.

## TU ESTILO
- Respondé de forma DETALLADA y completa, como si hablara el dueño del negocio
- Usá español rioplatense (vos, tuteo)
- Sé amable, profesional y preciso
- Nunca inventes información: si no sabés algo, decilo y ofrecé que un asesor los contacte
- Mantené respuestas por debajo de ~400 caracteres para WhatsApp (evitá mensajes larguísimos)

## INFORMACIÓN DEL NEGOCIO

### Producto
- Cajas de cartón corrugado a medida (tipo RSC - Regular Slotted Container)
- Dos canales: mayorista a medida (desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m², con
  troquelado e impresión) y minorista de medidas estándar de stock, desde
  ${RETAIL_CONFIG.MIN_M2_PEDIDO} m², que se cotiza en /cajas y se cierra por WhatsApp
- Solo Argentina: no exportamos

### Medidas y límites
- Mínimo por caja: ${MEDIDA_MINIMA.largo} x ${MEDIDA_MINIMA.ancho} x ${MEDIDA_MINIMA.alto} mm
- Máximo por caja: ${MEDIDA_MAXIMA.largo} x ${MEDIDA_MAXIMA.ancho} x ${MEDIDA_MAXIMA.alto} mm
  (cada máximo se alcanza solo con la otra medida en el mínimo)
- El ancho de plancha sale de sumar ancho + alto y no puede superar
  ${RETAIL_CONFIG.MAX_SHEET_WIDTH} mm, que es el ancho del rollo de cartón
- El largo de plancha tiene su propio tope: ${LARGO_MAXIMO_PLANCHA} mm. Hasta ahí la caja
  sale de una pieza; si el desarrollo se pasa, se fabrica en DOS MITADES que se
  pegan (la cotización del sistema ya lo incluye: material extra y un 25% por
  el pegado — si la cotización trae "fabricacion", contalo en una frase, sin
  sumarle nada). Como cada mitad también tiene que entrar en la plancha,
  largo + ancho no puede superar ${LARGO_MAXIMO_PLANCHA - 50} mm: pasado eso no hay caja
- Estos tres límites NO son mínimos de compra: una caja fuera de rango no se fabrica a
  ninguna cantidad. Si piden una así, decir por qué y ofrecer las medidas de catálogo
  más parecidas. NUNCA pedirles más cajas para "llegar al mínimo"
- El mínimo se mide en m² de cartón, NO en cantidad de cajas: ${RETAIL_CONFIG.MIN_M2_PEDIDO} m² para
  comprar, y ${RETAIL_CONFIG.MIN_M2_A_MEDIDA_PROPIA.toLocaleString('es-AR')} m² para cualquier caja a medida,
  troquelada o impresa. Si piden 50 o 100 cajas personalizadas, decir el mínimo y
  cuántas cajas de esa medida hacen falta

### Precios
Los precios y los cortes de tramo NO van escritos acá: llegan en el bloque
"PRECIOS ACTUALES" de cada consulta, leídos de la configuración vigente.
Usar SOLO esos valores. Nunca inventar un precio, ni ofrecer descuentos,
rebajas o condiciones especiales que no estén en ese bloque: si el cliente
pide una mejora, derivar a un asesor.
- Impresión: hasta 3 colores. Desde cierto volumen el costo está incluido; el bloque
  "PRECIOS ACTUALES" trae los umbrales. El polímero se cotiza siempre aparte y va a
  cargo del comprador.
- Moneda: ARS. El subtotal va sin IVA; el total con IVA 21% se informa aparte

### Envíos
- Hay envío gratis por volumen y cercanía; el mínimo de m² y el radio en km
  llegan en el bloque "PRECIOS ACTUALES". No afirmar otros valores.
- Para otras zonas o cantidades menores: se cotiza el envío
- Enviamos a todo el país

### Producción
- Sin impresión: ~7 días hábiles
- Con impresión: ~14 días hábiles
- Validez de cotización: 7 días

### Formas de pago
- ${PAGO.formas}
- ${PAGO.corto}
- El monto exacto de la seña no lo calcules vos: decile que se lo confirma alguien del equipo

### Datos de contacto
- WhatsApp: ${BUSINESS_PHONE}
- Email: ${CONTACTO.email}
- Dirección: ${CONTACTO.direccion}
- Horario: ${HORARIO.corto} (Argentina)

### Mensajes que arrancan con [COTIZADO-WEB]

Significa que la persona ya cotizó —en el sitio o a través de un asistente de
IA que consultó nuestra API— y viene a cerrar. El mensaje ya trae las medidas,
la cantidad y el precio.

Qué hacer:
1. NO volver a preguntar medidas, cantidad ni a recotizar. Ya está.
2. Confirmar el precio que trae el mensaje. Es el nuestro, sale de la misma
   configuración: no lo contradigas ni lo redondees distinto.
3. Ir directo a lo que falta para avanzar: nombre y empresa si no los tenemos,
   plazo que necesita, dirección de entrega, y si lleva impresión.
4. Si lleva impresión, avisar que la plantilla se descarga sola con las medidas
   y que puede mandar el arte por acá.
5. Tono de cierre, no de descubrimiento: alguien que llega así ya decidió.

### Estrategias comerciales (para mencionar cuando corresponda)
- Pedidos chicos: se venden de stock por el canal minorista (/cajas), con
  entrega más rápida. Derivar ahí en vez de negociar precio.
- Combinación de pedidos: si dos clientes tienen medidas similares, se pueden combinar para mejor precio
- Re-compra: si compraron hace 2-4 meses, podemos contactarlos para ver si necesitan más

## CUÁNDO DERIVAR A ASESOR
- Consultas complejas sobre pedidos combinados
- Reclamos o situaciones delicadas
- Cuando el cliente pide explícitamente hablar con alguien
- Si no podés responder con certeza

## REGLAS CRÍTICAS
1. NUNCA inventes precios exactos: los precios vienen de la cotización del sistema
2. Si piden cotización con cantidad y medidas (ej: "1400 cajas 40x20x15", "30x40x60, 1700"): el sistema calcula automáticamente. Si no te dio el precio, invitalos a incluir cantidad + medidas en el mismo mensaje (ej: "500 cajas 400x300x200")
3. NUNCA preguntes de nuevo por medidas o cantidad si el usuario YA los incluyó. Si corrigió un error (ej: "450 no 45" = la altura es 450), usá la corrección. Si dijo "450x380x450" y "1500 quiero", ya tiene todo. Dar la cotización directamente.
4. Si piden el desplegado, plantilla PDF o PDF para diseñar: el sistema genera el PDF automáticamente. Indicá que las áreas verdes son donde cargar el diseño. EXCEPCIÓN: las cajas que van en dos mitades (largo + ancho grande, la herramienta lo avisa con sin_plantilla) no tienen PDF automático — decí que el desplegado se lo prepara la fábrica con la orden, y que el diseño lo puede mandar igual.
5. Si es fuera de horario: mencioná que van a responder cuando abran
6. Mantené el tono cercano pero profesional`;

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface BoxTemplateResponse {
  response: string;
  boxTemplate: { length: number; width: number; height: number };
}

export interface AIContext {
  conversationState?: string;
  clientName?: string;
  companyName?: string;
  lastQuoteTotal?: number;
  lastQuoteM2?: number;
  /** Página de origen (ej: /cajas-ecommerce) - para personalizar respuesta */
  landingPage?: string;
  /** Segmento inferido de la landing (ecommerce, alimentos, mayorista, mudanza) */
  segmentHint?: string;
  /** Config de precios activa (para dar precios exactos) */
  pricingConfig?: ContextoDePrecios;
}

/** Lo que hace falta de pricing_config para armar el bloque de precios. */
export interface ContextoDePrecios {
  price_per_m2_standard: number;
  price_per_m2_volume: number;
  price_per_m2_below_minimum?: number | null;
  price_per_m2_retail: number;
  wholesale_min_m2: number;
  min_m2_pedido: number;
  min_m2_per_model: number;
  volume_threshold_m2: number;
  free_shipping_min_m2: number;
  free_shipping_max_km: number;
}

/**
 * El bloque de precios que se le inyecta al modelo. Existia dos veces —una para
 * WhatsApp y otra para el chat del sitio— y las dos derivaban el precio del
 * tramo intermedio a mano, con un `* 1.2` que da $1.080 donde la escalera real
 * cobra $1.000. Ahora los cuatro precios salen de getPricePerM2, que es la misma
 * funcion que factura: si el modelo dice un precio, es el que se cobra.
 */
function bloqueDePrecios(pricing: ContextoDePrecios | PricingConfig): string {
  const ars = (m2: number) => '$' + getPricePerM2(m2, pricing as PricingConfig);
  const n = (v: number) => v.toLocaleString('es-AR');
  return [
    'PRECIOS ACTUALES (usar SOLO estos si preguntan — no inventar ni negociar otros):',
    `- De catálogo, ${n(pricing.min_m2_pedido)} a ${n(pricing.wholesale_min_m2)} m²: ${ars(pricing.min_m2_pedido)}/m² (medidas estándar, sin impresión, se cotiza en /cajas)`,
    `- A medida, ${n(pricing.wholesale_min_m2)} a ${n(pricing.min_m2_per_model)} m²: ${ars(pricing.wholesale_min_m2)}/m²`,
    `- A medida, ${n(pricing.min_m2_per_model)} a ${n(pricing.volume_threshold_m2)} m²: ${ars(pricing.min_m2_per_model)}/m²`,
    `- A medida, más de ${n(pricing.volume_threshold_m2)} m²: ${ars(pricing.volume_threshold_m2)}/m²`,
    `- Envío gratis: ≥${n(pricing.free_shipping_min_m2)} m² y ≤${pricing.free_shipping_max_km} km`,
  ].join(String.fromCharCode(10));
}

/**
 * Obtiene el historial reciente de la conversación para contexto
 */
/**
 * Hasta cuándo un mensaje viejo sigue siendo "esta conversación".
 *
 * No había límite: se tomaban los últimos N mensajes sin mirar de cuándo eran.
 * Se vio en el primer mensaje real por Meta, donde el asistente saludó por un
 * nombre que la persona había escrito cuatro días antes, en una prueba.
 *
 * Eso fue simpático. Lo que no lo es: alguien que cotizó en marzo vuelve a
 * escribir y el asistente arranca leyendo esa cotización como si fuera de ahora
 * —con los precios de marzo— y le confirma un total que ya no existe. La
 * escalera de precios cambió dos veces este año.
 *
 * Siete días es un juicio, no una verdad: es bastante más que una conversación
 * de compra, que se resuelve en horas o en un par de días, y bastante menos que
 * el tiempo en que cambian los precios. La identidad no se pierde por esto: el
 * nombre y la empresa viven en el estado de la conversación y en el perfil de
 * contacto, no en el texto de los mensajes viejos.
 */
const HISTORIAL_VIGENTE_DIAS = 7;

export async function getRecentConversationHistory(
  phoneNumber: string,
  limit: number = 6
): Promise<ConversationTurn[]> {
  try {
    const supabase = createAdminClient();
    const desde = new Date(Date.now() - HISTORIAL_VIGENTE_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('communications')
      .select('direction, content')
      .eq('channel', 'whatsapp')
      .eq('metadata->>phone', phoneNumber)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!data?.length) return [];

    const turns: ConversationTurn[] = data
      .reverse()
      .map((m) => ({
        role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content || '',
      }))
      .filter((t) => t.content.trim().length > 0);

    return turns;
  } catch (error) {
    console.error('[WhatsApp AI] Error fetching history:', error);
    return [];
  }
}

/**
 * Genera una respuesta conversacional usando la IA.
 * Puede devolver string o BoxTemplateResponse cuando el usuario pide el desplegado PDF.
 */
export async function generateConversationalResponse(
  userMessage: string,
  phoneNumber: string,
  context?: AIContext
): Promise<string | BoxTemplateResponse> {
  if (!groq) {
    return 'Disculpá, en este momento no puedo procesar tu mensaje. Escribí "cotizar" para una cotización o contactanos por WhatsApp al ' + BUSINESS_PHONE;
  }

  try {
    const [history, pricingConfig] = await Promise.all([
      getRecentConversationHistory(phoneNumber, 8),
      getActivePricingConfig(),
    ]);

    // Pedido de desplegado/plantilla PDF (prioridad sobre cotización)
    const templateResponse = await tryBoxTemplateRequest(userMessage, history);
    if (templateResponse) return templateResponse;

    const quoteResponse = await tryQuoteFromConversation(
      userMessage,
      history,
      pricingConfig || null
    );
    if (quoteResponse) {
      return quoteResponse;
    }

    const ctx = context || {};
    const pricing = ctx.pricingConfig || pricingConfig;

    const contextBlock = `
CONTEXTO ACTUAL:
- Estado de conversación: ${ctx.conversationState || 'inicial'}
${ctx.clientName ? `- Nombre del contacto: ${ctx.clientName}` : ''}
${ctx.companyName ? `- Empresa: ${ctx.companyName}` : ''}
${ctx.lastQuoteTotal ? `- Última cotización: $${ctx.lastQuoteTotal.toLocaleString('es-AR')} (${ctx.lastQuoteM2?.toLocaleString('es-AR')} m²)` : ''}
${pricing ? bloqueDePrecios(pricing) : ''}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: KNOWLEDGE_PROMPT + contextBlock },
    ];

    // Agregar historial (últimos mensajes para no exceder contexto)
    for (const turn of history.slice(-6)) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content,
      });
    }

    // Mensaje actual
    messages.push({ role: 'user', content: userMessage });

    const completion = await completarConCascada(
      groq,
      { messages, temperature: 0.7, max_tokens: 350 },
      MODELOS_CONVERSACION,
      'WhatsApp AI',
    );

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return 'No pude generar una respuesta. Escribí "cotizar" para una cotización o "asesor" para hablar con alguien.';
    }

    // Limpiar posibles asteriscos o markdown que no se ven bien en WhatsApp
    return response
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    console.error('[WhatsApp AI] Error generando respuesta:', error);
    return 'Hubo un error procesando tu mensaje. Escribí "cotizar" para una cotización o contactanos al ' + BUSINESS_PHONE;
  }
}

export function isWhatsAppAIEnabled(): boolean {
  return !!groq;
}

/** Patrones que indican que el usuario pide el desplegado/plantilla PDF */
const BOX_TEMPLATE_REQUEST_PATTERNS = [
  /desplegado/i,
  /plantilla\s*(pdf)?/i,
  /pdf\s*(para|de)\s*(diseñar|diseño|incorporar)/i,
  /incorporar(le)?\s*(el\s+)?diseño/i,
  /cargar(te)?(lo)?\s*(acá|aquí)/i,
  /cargar(te)?\s*(el\s+)?diseño/i,
  /descargar\s*(la\s+)?plantilla/i,
];

function isBoxTemplateRequest(message: string): boolean {
  return BOX_TEMPLATE_REQUEST_PATTERNS.some((p) => p.test(message));
}

/**
 * Si el usuario pide el desplegado/plantilla PDF y hay dimensiones en el historial, devuelve la respuesta con metadata.
 */
async function tryBoxTemplateRequest(
  userMessage: string,
  history: ConversationTurn[]
): Promise<BoxTemplateResponse | null> {
  if (!isBoxTemplateRequest(userMessage)) return null;

  const combinedText = [
    ...history.filter((t) => t.role === 'user').map((t) => t.content),
    ...history.filter((t) => t.role === 'assistant').map((t) => t.content),
    userMessage,
  ].join(' ');

  const parsed = parseBoxDimensions(combinedText);
  if (!parsed?.length || !parsed?.width || !parsed?.height) {
    return null;
  }

  const validation = validateDimensions(parsed.length, parsed.width, parsed.height);
  if (!validation.valid) return null;

  const message = `Acá tenés el desplegado de tu caja ${parsed.length}×${parsed.width}×${parsed.height} mm.

Las áreas verdes son donde podés cargar tu diseño. Cuando tengas el archivo listo (PDF, AI, EPS), subilo acá y lo revisamos para tu cotización.`;

  return {
    response: message,
    boxTemplate: {
      length: parsed.length,
      width: parsed.width,
      height: parsed.height,
    },
  };
}

/**
 * Intenta extraer cantidad + dimensiones de la conversación y calcular cotización real.
 * Si tiene datos completos, devuelve la cotización formateada. Si no, null.
 */
async function tryQuoteFromConversation(
  userMessage: string,
  history: ConversationTurn[],
  config: PricingConfig | null
): Promise<string | BoxTemplateResponse | null> {
  // Si pide plantilla/desplegado, no devolver cotización (manejado por tryBoxTemplateRequest)
  if (isBoxTemplateRequest(userMessage)) return null;

  const combinedText = [
    ...history.filter((t) => t.role === 'user').map((t) => t.content),
    userMessage,
  ].join(' ');

  let parsed = parseBoxDimensions(userMessage);
  if (!parsed?.length || !parsed?.width || !parsed?.height || !parsed?.quantity) {
    parsed = parseBoxDimensions(combinedText);
  }
  if (!parsed?.length || !parsed?.width || !parsed?.height || !parsed?.quantity) {
    return null;
  }

  const configToUse = config || getFallbackPricingConfig();

  // PRIMERO si la caja se puede fabricar, DESPUES si el pedido llega al minimo.
  //
  // Estaba al reves, y ademas el minimo se chequeaba aca con su propia cuenta.
  // Las dos cosas juntas daban esto: alguien pedia 50 cajas de 900x800x700 —que
  // no entra en el rollo— y le contestabamos "con esa medida el minimo son 194
  // cajas, te sirve?". O sea que le pediamos mas cajas de una caja que la
  // fabrica no puede hacer, y si decia que si, se las volviamos a rechazar.
  const validation = validateDimensions(parsed.length, parsed.width, parsed.height);
  if (!validation.valid) {
    return validation.error || null;
  }

  // El piso ya no se chequea aca: lo decide calcularCotizacion() unas lineas
  // mas abajo, que ademas devuelve las medidas de catalogo mas parecidas ya
  // cotizadas. Esta copia local del minimo era una de las cinco que habia, y la
  // unica que no ofrecia alternativas: decia "el minimo son N cajas" y ahi
  // terminaba la conversacion.

  const hasPrinting =
    /impres[ií]on|impreso|logo|2\s*colores?|dos\s*colores?|con\s*impres[ií]on|con\s*impreso/i.test(combinedText) ||
    /^si$/i.test(combinedText);

  // Contra el mismo motor que la web, la API, el MCP y el bot de WhatsApp.
  // Esta era la tercera copia del calculo: no aplicaba IVA, escribia "válida 7
  // días" a mano y no sabia por que canal sale el pedido. Un mismo cliente
  // podia ver un numero acá y otro en la página.
  const catalogo = await leerCatalogoDeStock();
  const cotizacion = calcularCotizacion(
    [{
      length_mm: parsed.length,
      width_mm: parsed.width,
      height_mm: parsed.height,
      quantity: parsed.quantity,
      printing_colors: hasPrinting ? 1 : 0,
    }],
    configToUse,
    catalogo,
  );

  const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
  const m2Formatted = cotizacion.total_m2.toLocaleString('es-AR', { maximumFractionDigits: 1 });

  // El minimo de compra es excluyente: por debajo no hay precio que dar. Antes
  // se cotizaba igual y se aclaraba al pie, que es lo mismo que invitar a
  // negociar la cantidad.
  if (!cotizacion.cotizable) {
    const imp = cotizacion.impedimento;
    const alt = imp.alternativas[0];
    // Si hay una medida de catalogo parecida se la ofrecemos ya cotizada. Decir
    // que no sin decir que si termina en "escribinos por WhatsApp", que es
    // mandar a una persona a hacer una busqueda que ya esta hecha.
    if (alt) {
      return (
        `${imp.motivo}\n\n` +
        `La más parecida que tenemos es ${alt.length_mm}x${alt.width_mm}x${alt.height_mm} mm: ` +
        `${alt.cantidad.toLocaleString('es-AR')} cajas a ${precioUnitarioARS(alt.precio_por_caja)} ` +
        `cada una, subtotal $${Math.round(alt.subtotal).toLocaleString('es-AR')} sin IVA ` +
        `(${Math.round(alt.total_con_iva).toLocaleString('es-AR')} con IVA). ¿Te sirve?`
      );
    }
    // El cierre lo arma el motor: aca decia "no cotizamos por debajo de ese
    // volumen" para los tres impedimentos, y para una caja que no entra en el
    // rollo eso contradice al motivo que viene justo antes.
    return (
      mensajeDeImpedimento(imp) +
      (imp.tipo !== 'no_fabricable' && imp.cajas_necesarias
        ? ` Si te sirven ${imp.cajas_necesarias.toLocaleString('es-AR')} cajas de esa medida, decime y te paso el precio.`
        : '')
    );
  }

  const dimNote = parsed.convertedFromCm
    ? ` (${Math.round(parsed.length / 10)}x${Math.round(parsed.width / 10)}x${Math.round(parsed.height / 10)} cm → mm)`
    : '';

  // Lo COTIZADO, no lo pedido: si pidio impresion y el pedido no llega al
  // volumen que la habilita, el motor cotiza la caja lisa. Etiquetar ese
  // precio "con impresión" —o mandar el desplegado para un arte que no se va
  // a imprimir— es prometer lo que el precio no incluye.
  const impresionCotizada = cotizacion.boxes[0].printing_colors > 0;

  const quoteText = `Cotización para ${parsed.quantity.toLocaleString('es-AR')} cajas ${parsed.length}x${parsed.width}x${parsed.height} mm${dimNote}${impresionCotizada ? ' con impresión' : ''}:

• Precio por caja: ${precioUnitarioARS(cotizacion.boxes[0].unit_price)} + IVA
• Subtotal: ${ars(cotizacion.subtotal)} + IVA
• Total con IVA 21%: ${ars(cotizacion.total_with_tax)}
• Superficie total: ${m2Formatted} m²
• Entrega estimada: ~${cotizacion.estimated_days} días hábiles

${cotizacion.channel_note}${hasPrinting && !impresionCotizada ? `\n\n${cotizacion.printing.price_note}` : ''}

Podés verla y compartirla acá: ${SITE_URL}/cotizar/${parsed.length}x${parsed.width}x${parsed.height}/${parsed.quantity}`;

  // Con impresión: ofrecer el desplegado PDF inmediatamente para que carguen el diseño
  if (impresionCotizada) {
    return {
      response: `${quoteText}

Acá te envío el desplegado de la caja para que puedas incorporar tu diseño. Las áreas verdes indican dónde cargar el logo o diseño. Cuando lo tengas listo (PDF, AI, EPS), subilo acá y lo revisamos.

¿Querés cambiar cantidad o que te contacte un asesor?`,
      boxTemplate: {
        length: parsed.length,
        width: parsed.width,
        height: parsed.height,
      },
    };
  }

  // Si pidio impresion y salio lisa, ofrecerle "agregar impresión" es dar la
  // vuelta entera: la nota de arriba ya dijo cuantas cajas hacen falta.
  return hasPrinting && !impresionCotizada
    ? `${quoteText} ¿Querés cambiar cantidad o que te contacte un asesor?`
    : `${quoteText} ¿Querés agregar impresión, cambiar cantidad o que te contacte un asesor?`;
}

/** Inferir segmento desde path para personalizar respuestas (campaña SEM) */
function inferSegmentFromPath(path: string): string | null {
  if (path.includes('cajas-ecommerce')) return 'e-commerce / envíos';
  if (path.includes('cajas-alimentos')) return 'delivery / gastronomía';
  if (path.includes('mayorista')) return 'mayorista / volumen';
  if (path.includes('cajas-mudanza')) return 'mudanza / guardamuebles';
  return null;
}

/**
 * Genera respuesta para el chatbot web (mismo conocimiento, historial pasado como parámetro).
 * Puede devolver string o { response, templateUrl } cuando piden el desplegado PDF.
 */
export async function generateChatResponse(
  userMessage: string,
  history: ConversationTurn[] = [],
  context?: AIContext
): Promise<string | { response: string; templateUrl: string }> {
  if (!groq) {
    return 'Disculpá, en este momento no puedo procesar tu mensaje. Visitá nuestra página de contacto o escribinos por WhatsApp al ' + BUSINESS_PHONE;
  }

  try {
    const [pricingConfig] = await Promise.all([getActivePricingConfig()]);

    // Pedido de desplegado/plantilla PDF
    const templateResponse = await tryBoxTemplateRequest(userMessage, history);
    if (templateResponse) {
      const baseUrl = SITE_URL;
      const templateUrl = `${baseUrl}/api/box-template?length=${templateResponse.boxTemplate.length}&width=${templateResponse.boxTemplate.width}&height=${templateResponse.boxTemplate.height}`;
      return { response: templateResponse.response, templateUrl };
    }

    const quoteResponse = await tryQuoteFromConversation(
      userMessage,
      history,
      pricingConfig || null
    );
    if (quoteResponse) {
      if (typeof quoteResponse === 'object' && 'boxTemplate' in quoteResponse) {
        const baseUrl = SITE_URL;
        const templateUrl = `${baseUrl}/api/box-template?length=${quoteResponse.boxTemplate.length}&width=${quoteResponse.boxTemplate.width}&height=${quoteResponse.boxTemplate.height}`;
        return { response: quoteResponse.response, templateUrl };
      }
      return quoteResponse;
    }
    const ctx = context || {};
    const pricing = ctx.pricingConfig || pricingConfig;

    const segmentHint = ctx.segmentHint || (ctx.landingPage ? inferSegmentFromPath(ctx.landingPage) : null);
    const segmentLine = segmentHint
      ? `\n- Usuario vino de página de ${segmentHint}: personalizá la respuesta si tiene sentido.`
      : '';
    const isFirstMessage = history.length === 0;
    const askSegmentLine = isFirstMessage && !segmentHint
      ? '\n- Si la consulta es genérica: preguntale brevemente "¿Para qué necesitás las cajas? (e-commerce, delivery, mudanza, mayorista...)" para orientarlo mejor.'
      : '';

    const contextBlock = `
CONTEXTO: Usuario en la web de Quilmes Corrugados. No tiene historial de WhatsApp.
- Estado: ${ctx.conversationState || 'inicial'}
- Página actual: ${ctx.landingPage || 'desconocida'}${segmentLine}${askSegmentLine}
${pricing ? bloqueDePrecios(pricing) : ''}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: KNOWLEDGE_PROMPT.replace('WhatsApp', 'sitio web').replace(/Escribí "cotizar"/g, 'Usá el cotizador') + contextBlock },
    ];

    for (const turn of history.slice(-6)) {
      messages.push({
        role: turn.role === 'user' ? 'user' : 'assistant',
        content: turn.content,
      });
    }
    messages.push({ role: 'user', content: userMessage });

    const completion = await completarConCascada(
      groq,
      { messages, temperature: 0.7, max_tokens: 450 },
      MODELOS_CONVERSACION,
      'Chat AI',
    );

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return 'No pude generar una respuesta. Visitá /cotizacion para cotizar o /contacto para escribirnos.';
    }

    return response
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    console.error('[Chat AI] Error:', error);
    return 'Hubo un error. Escribinos por WhatsApp al ' + BUSINESS_PHONE + ' o visitá /contacto.';
  }
}
