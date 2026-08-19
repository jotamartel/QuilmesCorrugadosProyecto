/**
 * IA conversacional para WhatsApp - Quilmes Corrugados
 * Genera respuestas detalladas usando el conocimiento del negocio
 */
import Groq from 'groq-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getActivePricingConfig,
  getPricePerM2,
  getProductionDays,
} from '@/lib/utils/pricing';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { SITE_URL } from '@/lib/site';
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

const PRINTING_INCREMENT = 0.15; // +15% por cada color de impresión

/**
 * Config de precios de respaldo, para cuando la DB no responde (env vars, RLS).
 * Tiene que quedar ALINEADA con la fila activa de pricing_config: si se
 * desincroniza, el bot cotiza precios viejos justo cuando nadie lo esta mirando.
 * Ultima verificacion contra produccion: 2026-08-15.
 */
function getFallbackPricingConfig(): PricingConfig {
  return {
    id: 'fallback',
    price_per_m2_standard: 740,
    price_per_m2_volume: 700,
    volume_threshold_m2: 5000,
    min_m2_per_model: 3000,
    wholesale_min_m2: 1000,
    price_per_m2_below_minimum: 900,
    price_per_m2_retail: 990,
    printing_min_m2: 1000,
    printing_included_min_m2: 3000,
    printing_surcharge_per_color: 0.15,
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
- Dos canales: mayorista a medida (desde 3.000 m² por modelo) y minorista de
  stock desde 100 cajas, que se compra online en /cajas
- Solo Argentina: no exportamos

### Medidas y límites
- Mínimo por caja: 200 x 200 x 100 mm
- Máximo: ancho + alto no puede superar 1200 mm (limitación de plancha)
- Cantidad mínima: 100 unidades de stock, o 3.000 m² por modelo a medida

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
- Pago contado y cheque a 30 días (según perfil del cliente)
- Seña 50% para confirmar, resto contra entrega

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
4. Si piden el desplegado, plantilla PDF o PDF para diseñar: el sistema genera el PDF automáticamente. Indicá que las áreas verdes son donde cargar el diseño.
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
  pricingConfig?: {
    price_per_m2_standard: number;
    price_per_m2_volume: number;
    price_per_m2_below_minimum?: number;
    price_per_m2_retail: number;
    wholesale_min_m2: number;
    min_m2_per_model: number;
    volume_threshold_m2: number;
    free_shipping_min_m2: number;
    free_shipping_max_km: number;
  };
}

/**
 * Obtiene el historial reciente de la conversación para contexto
 */
export async function getRecentConversationHistory(
  phoneNumber: string,
  limit: number = 6
): Promise<ConversationTurn[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('communications')
      .select('direction, content')
      .eq('channel', 'whatsapp')
      .eq('metadata->>phone', phoneNumber)
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
${pricing ? `
PRECIOS ACTUALES (usar SOLO estos si preguntan — no inventar ni negociar otros):
- De stock, hasta ${pricing.wholesale_min_m2} m²: $${pricing.price_per_m2_retail}/m² (medidas estándar, desde 100 cajas, se compra en /cajas)
- A medida, ${pricing.wholesale_min_m2} a ${pricing.min_m2_per_model} m²: $${pricing.price_per_m2_below_minimum ?? pricing.price_per_m2_standard * 1.2}/m²
- A medida, ${pricing.min_m2_per_model} a ${pricing.volume_threshold_m2} m²: $${pricing.price_per_m2_standard}/m²
- A medida, más de ${pricing.volume_threshold_m2} m²: $${pricing.price_per_m2_volume}/m²
- Envío gratis: ≥${pricing.free_shipping_min_m2} m² y ≤${pricing.free_shipping_max_km} km
` : ''}`;

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

  if (parsed.quantity < RETAIL_CONFIG.MIN_CANTIDAD) {
    return `La cantidad mínima es ${RETAIL_CONFIG.MIN_CANTIDAD} unidades. Indicaste ${parsed.quantity.toLocaleString('es-AR')}. ¿Querés cotizar con la cantidad mínima o más?`;
  }

  const validation = validateDimensions(parsed.length, parsed.width, parsed.height);
  if (!validation.valid) {
    return validation.error || null;
  }

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

  const dimNote = parsed.convertedFromCm
    ? ` (${Math.round(parsed.length / 10)}x${Math.round(parsed.width / 10)}x${Math.round(parsed.height / 10)} cm → mm)`
    : '';

  const quoteText = `Cotización para ${parsed.quantity.toLocaleString('es-AR')} cajas ${parsed.length}x${parsed.width}x${parsed.height} mm${dimNote}${hasPrinting ? ' con impresión' : ''}:

• Precio por caja: ${precioUnitarioARS(cotizacion.boxes[0].unit_price)} + IVA
• Subtotal: ${ars(cotizacion.subtotal)} + IVA
• Total con IVA 21%: ${ars(cotizacion.total_with_tax)}
• Superficie total: ${m2Formatted} m²
• Entrega estimada: ~${cotizacion.estimated_days} días hábiles

${cotizacion.channel_note}

Podés verla y compartirla acá: ${SITE_URL}/cotizar/${parsed.length}x${parsed.width}x${parsed.height}/${parsed.quantity}`;

  // Con impresión: ofrecer el desplegado PDF inmediatamente para que carguen el diseño
  if (hasPrinting) {
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

  return `${quoteText} ¿Querés agregar impresión, cambiar cantidad o que te contacte un asesor?`;
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
${pricing ? `
PRECIOS ACTUALES:
- Estándar: $${pricing.price_per_m2_standard}/m² (≥${pricing.min_m2_per_model} m²)
- Mayorista: $${pricing.price_per_m2_volume}/m² (≥${pricing.volume_threshold_m2} m²)
- Pedidos chicos: $${pricing.price_per_m2_below_minimum ?? pricing.price_per_m2_standard * 1.2}/m² (coordinar: $850)
- Envío gratis: ≥${pricing.free_shipping_min_m2} m² y ≤${pricing.free_shipping_max_km} km
` : ''}`;

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
