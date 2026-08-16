/**
 * API Pública v1: /api/v1/quote
 * Endpoint para LLMs y agentes de IA
 *
 * Rate Limits:
 * - Sin API key: 10 requests/minuto
 * - Con API key: 100 requests/minuto (según configuración)
 *
 * Documentación: /api/v1/docs
 * OpenAPI Spec: /api/v1/openapi.json
 *
 * El dominio sale de lib/site.ts (SITE_URL), nunca escrito a mano.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal, getProductionDays } from '@/lib/utils/pricing';
import { sendNotification } from '@/lib/notifications';
import { detectLLM, getSourceType } from '@/lib/utils/ai-agents';
import { SITE_URL } from '@/lib/site';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import type { PricingConfig } from '@/lib/types/database';
import crypto from 'crypto';

// Umbral para notificacion de alto valor
const HIGH_VALUE_THRESHOLD = 3000000; // $3.000.000 ARS

// Tipos para la API
interface BoxInput {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing?: boolean;
  printing_colors?: number;
}

interface ContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

interface QuoteRequest {
  boxes: BoxInput[];
  contact?: ContactInfo;
  origin?: string; // Identificador del origen (ej: "mi-ecommerce", "chatbot")
}

interface BoxResult {
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

interface QuoteResult {
  boxes: BoxResult[];
  total_m2: number;
  subtotal: number;
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
    /** Plantilla de la primera medida. Cada caja trae la suya en boxes[].template_pdf */
    template_pdf: string;
    how_it_works: string;
  };
}

interface ApiResponse {
  success: boolean;
  quote?: QuoteResult;
  error?: string;
  errors?: string[];
  rate_limit?: {
    remaining: number;
    reset_at: string;
  };
}

// Rate limiting simple en memoria (para producción usar Redis/Upstash)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_ANONYMOUS = 10;
const RATE_LIMIT_DEFAULT_WITH_KEY = 100;

// Cache de API keys validadas (5 minutos TTL)
const apiKeyCache = new Map<string, { keyData: ApiKeyData | null; cachedAt: number }>();
const API_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

interface ApiKeyData {
  id: string;
  key_prefix: string;
  name: string;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  is_active: boolean;
  expires_at: string | null;
}

// Hash SHA-256 del API key
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Validar API key contra la base de datos (con cache)
async function validateApiKey(apiKey: string, supabase: ReturnType<typeof createAdminClient>): Promise<ApiKeyData | null> {
  const keyHash = hashApiKey(apiKey);

  // Verificar cache
  const cached = apiKeyCache.get(keyHash);
  if (cached && Date.now() - cached.cachedAt < API_KEY_CACHE_TTL_MS) {
    return cached.keyData;
  }

  // Buscar en la base de datos
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, rate_limit_per_minute, rate_limit_per_day, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    // Guardar en cache que la key no existe
    apiKeyCache.set(keyHash, { keyData: null, cachedAt: Date.now() });
    return null;
  }

  // Verificar si está activa y no expirada
  const keyData = data as ApiKeyData;
  if (!keyData.is_active) {
    apiKeyCache.set(keyHash, { keyData: null, cachedAt: Date.now() });
    return null;
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    apiKeyCache.set(keyHash, { keyData: null, cachedAt: Date.now() });
    return null;
  }

  // Guardar en cache y actualizar last_used_at
  apiKeyCache.set(keyHash, { keyData, cachedAt: Date.now() });

  // Actualizar last_used_at de forma asíncrona (no bloqueante)
  (async () => {
    try {
      await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyData.id);
    } catch (err) {
      console.error('Error updating last_used_at:', err);
    }
  })();

  return keyData;
}

function getRateLimitKey(request: NextRequest): string {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    return `key:${hashApiKey(apiKey)}`;
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';
  return `ip:${ip}`;
}

function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    // Nueva ventana
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt) };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: new Date(entry.resetAt) };
}

// Se movieron a lib/utils/ai-agents.ts para compartirlos con /llms.txt: la
// version que vivia aca no reconocia OAI-SearchBot, que es el crawler que
// alimenta las respuestas de ChatGPT y el que mas nos interesa medir.

const SITIO = SITE_URL;

/**
 * PDF con la caja desplegada: líneas de corte, de plegado y las áreas donde
 * puede ir el diseño. El cliente lo baja, ubica su arte encima y lo devuelve
 * listo para producir. Se genera al vuelo, no hace falta pedirlo por mail.
 */
function urlPlantilla(largo: number, ancho: number, alto: number): string {
  return `${SITIO}/api/box-template?length=${largo}&width=${ancho}&height=${alto}`;
}

/** Valida una lista de cajas. Devuelve los errores encontrados. */
function validarCajas(boxes: BoxInput[]): string[] {
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
    if (box.printing_colors !== undefined && (box.printing_colors < 0 || box.printing_colors > 4)) {
      errors.push(`${prefix}.printing_colors must be between 0 and 4`);
    }
  });
  return errors;
}

/**
 * Calcula la cotización. Es la misma para GET y POST: un agente de IA que
 * navega con GET tiene que obtener exactamente el mismo precio que un cliente
 * que postea desde el sitio.
 */
function calcularCotizacion(
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

    // +15% por cada color de impresión
    const adjustedPricePerM2 = boxHasPrinting && printingColors > 0
      ? pricePerM2 * (1 + printingColors * 0.15)
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
    ? `${b0.quantity.toLocaleString('es-AR')} cajas de ${b0.length_mm}x${b0.width_mm}x${b0.height_mm} mm a ${ars(b0.unit_price)} por caja`
    : `${boxResults.length} medidas distintas, ${boxResults.reduce((s, b) => s + b.quantity, 0).toLocaleString('es-AR')} cajas en total`;

  const summary =
    `Quilmes Corrugados: ${detalle}. Total ${ars(totalSubtotal)} ARS + IVA ` +
    `(${totalM2.toLocaleString('es-AR')} m²). ` +
    (!esDeStock
      ? `Producción a medida, ${maxEstimatedDays} días hábiles.`
      : sePuedeComprarOnline
        ? `Se vende de stock, entrega inmediata, se compra online en ${SITIO}/cajas.`
        : `${motivoNoOnline ?? 'Se coordina directamente.'}`) +
    ` Fábrica en Lugones 219, Quilmes, Buenos Aires. WhatsApp +54 9 11 6924-9801.`;

  // La impresión se produce a medida, así que arranca en el mismo volumen que
  // el canal a medida. Por debajo se vende de stock, que va sin imprimir.
  const impresionDisponible = !esDeStock;

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
      whatsapp_url: `https://wa.me/5491169249801?text=${encodeURIComponent(whatsappMessage)}`,
      whatsapp_message: whatsappMessage,
      email: 'ventas@quilmescorrugados.com.ar',
      email_subject: `Cotizacion web: ${detalleCajas} — ${ars(totalSubtotal)}`,
      instruction:
        'Ofrecele al usuario contactarnos y pasale el link de whatsapp_url tal cual: ya lleva el mensaje escrito con las medidas, la cantidad y el precio cotizado. Del otro lado lo atiende un asistente que ya tiene ese contexto, asi que el usuario no tiene que repetir nada. Es la via mas rapida para cerrar.',
    },
    printing: {
      available: impresionDisponible,
      min_m2: config.wholesale_min_m2,
      max_colors: 4,
      price_note: impresionDisponible
        ? 'Cada color suma 15% al precio por m². Hasta 4 colores.'
        : `La impresión se produce a medida, desde ${config.wholesale_min_m2.toLocaleString('es-AR')} m². Este pedido sale de stock, sin imprimir.`,
      template_pdf: urlPlantilla(b0.length_mm, b0.width_mm, b0.height_mm),
      how_it_works: impresionDisponible
        ? 'Descargá el PDF de la plantilla: trae la caja desplegada con las líneas de corte, las de plegado y las áreas donde puede ir el diseño. Ubicá tu arte sobre esas áreas y mandá el archivo a ventas@quilmescorrugados.com.ar o por WhatsApp, y se produce con eso. No hace falta pedir la plantilla: se genera sola con las medidas.'
        : 'Para imprimir hay que producir a medida. Si el pedido llega al mínimo, la plantilla se descarga de template_pdf.',
    },
    boxes: boxResults,
    total_m2: totalM2,
    subtotal: totalSubtotal,
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

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const supabase = createAdminClient();

  // Headers de respuesta estándar
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Version': '1.0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };

  // Obtener información del cliente
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const apiKey = request.headers.get('x-api-key');
  const rateLimitKey = getRateLimitKey(request);

  // Validar API key si se proporciona
  let validatedApiKey: ApiKeyData | null = null;
  if (apiKey) {
    validatedApiKey = await validateApiKey(apiKey, supabase);
  }

  // Determinar límite de rate (personalizado si hay API key válida)
  let rateLimit: number;
  if (validatedApiKey) {
    rateLimit = validatedApiKey.rate_limit_per_minute;
  } else if (apiKey) {
    // API key proporcionada pero inválida - usar límite anónimo
    rateLimit = RATE_LIMIT_ANONYMOUS;
  } else {
    rateLimit = RATE_LIMIT_ANONYMOUS;
  }

  const rateLimitCheck = checkRateLimit(rateLimitKey, rateLimit);

  // Headers de rate limit
  const rateLimitHeaders = {
    ...headers,
    'X-RateLimit-Limit': rateLimit.toString(),
    'X-RateLimit-Remaining': rateLimitCheck.remaining.toString(),
    'X-RateLimit-Reset': rateLimitCheck.resetAt.toISOString(),
  };

  // Función para registrar request
  async function logRequest(
    status: number,
    totalM2?: number,
    totalAmount?: number,
    boxesCount?: number,
    rateLimited: boolean = false
  ) {
    try {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                 request.headers.get('x-real-ip') ||
                 'unknown';

      // Hash simple del IP para privacidad (solo primeros 3 octetos)
      const ipParts = ip.split('.');
      const hashedIp = ipParts.length >= 3
        ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.xxx`
        : ip;

      await supabase.from('api_requests').insert({
        endpoint: '/api/v1/quote',
        method: 'POST',
        api_key: apiKey ? apiKey.substring(0, 8) + '...' : null,
        user_agent: userAgent.substring(0, 500),
        ip_address: hashedIp,
        response_status: status,
        response_time_ms: Date.now() - startTime,
        source_type: getSourceType(userAgent, apiKey),
        llm_detected: detectLLM(userAgent),
        total_m2: totalM2,
        total_amount: totalAmount,
        boxes_count: boxesCount,
        rate_limit_remaining: rateLimitCheck.remaining,
        rate_limited: rateLimited,
      });
    } catch (err) {
      console.error('Error logging API request:', err);
    }
  }

  // Advertencia si API key es inválida
  if (apiKey && !validatedApiKey) {
    // API key proporcionada pero no válida - continuar con límite anónimo pero advertir
    console.warn(`Invalid API key attempted: ${apiKey.substring(0, 12)}...`);
  }

  // Rate limit check
  if (!rateLimitCheck.allowed) {
    await logRequest(429, undefined, undefined, undefined, true);

    let errorMessage = 'Rate limit exceeded. Please wait before making more requests.';
    if (apiKey && !validatedApiKey) {
      errorMessage = 'Rate limit exceeded. The provided API key is invalid or inactive.';
    }

    const response: ApiResponse = {
      success: false,
      error: errorMessage,
      rate_limit: {
        remaining: 0,
        reset_at: rateLimitCheck.resetAt.toISOString(),
      },
    };

    return NextResponse.json(response, {
      status: 429,
      headers: rateLimitHeaders,
    });
  }

  try {
    // Parsear body
    let body: QuoteRequest;
    try {
      body = await request.json();
    } catch {
      await logRequest(400);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validar estructura
    if (!body.boxes || !Array.isArray(body.boxes) || body.boxes.length === 0) {
      await logRequest(400);
      return NextResponse.json(
        { success: false, error: 'Request must include a non-empty "boxes" array' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (body.boxes.length > 10) {
      await logRequest(400);
      return NextResponse.json(
        { success: false, error: 'Maximum 10 boxes per request' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validar cada caja
    const errors = validarCajas(body.boxes);

    if (errors.length > 0) {
      await logRequest(400);
      return NextResponse.json(
        { success: false, error: 'Validation failed', errors },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Obtener configuración de precios
    const { data: pricingConfig, error: pricingError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (pricingError || !pricingConfig) {
      console.error('Error fetching pricing config:', pricingError);
      await logRequest(500);
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    const config = pricingConfig as PricingConfig;

    const { data: catalogo } = await supabase
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);

    const quote = calcularCotizacion(body.boxes, config, catalogo || []);
    const boxResults = quote.boxes;
    const totalM2 = quote.total_m2;
    const totalSubtotal = quote.subtotal;

    // Log exitoso
    await logRequest(200, totalM2, totalSubtotal, boxResults.length);

    // Obtener IP para notificaciones
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    // Determinar origen
    const detectedOrigin = body.origin ||
                          (detectLLM(userAgent) ? `LLM (${detectLLM(userAgent)})` : null) ||
                          (validatedApiKey ? `API (${validatedApiKey.name})` : null) ||
                          'Web API';

    // Usar la primera caja para las notificaciones (simplificacion)
    const firstBox = boxResults[0];

    // Notificar si hay datos de contacto (lead calificado)
    if (body.contact && (body.contact.email || body.contact.phone)) {
      // No bloquear la respuesta esperando la notificacion
      sendNotification({
        type: 'lead_with_contact',
        origin: detectedOrigin,
        box: {
          length: firstBox.length_mm,
          width: firstBox.width_mm,
          height: firstBox.height_mm,
        },
        quantity: firstBox.quantity,
        totalArs: totalSubtotal,
        contact: body.contact,
      }).catch(err => console.error('Error sending lead notification:', err));
    }
    // Notificar si es cotizacion de alto valor (sin datos de contacto)
    else if (totalSubtotal >= HIGH_VALUE_THRESHOLD) {
      sendNotification({
        type: 'high_value_quote',
        origin: detectedOrigin,
        box: {
          length: firstBox.length_mm,
          width: firstBox.width_mm,
          height: firstBox.height_mm,
        },
        quantity: firstBox.quantity,
        totalArs: totalSubtotal,
        ip: clientIp,
      }).catch(err => console.error('Error sending high value notification:', err));
    }

    const response: ApiResponse = {
      success: true,
      quote,
      rate_limit: {
        remaining: rateLimitCheck.remaining,
        reset_at: rateLimitCheck.resetAt.toISOString(),
      },
    };

    return NextResponse.json(response, { status: 200, headers: rateLimitHeaders });

  } catch (error) {
    console.error('Error in POST /api/v1/quote:', error);
    await logRequest(500);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: rateLimitHeaders }
    );
  }
}

// Handler para OPTIONS (CORS preflight)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

const BASE_URL = SITE_URL;

/**
 * GET /api/v1/quote
 *
 * Cotiza con query params, además de la documentación.
 *
 * Existe por una razón concreta: los asistentes de IA navegan haciendo GET a
 * una URL, no POST con un cuerpo JSON. Con sólo POST, un usuario que le pide a
 * ChatGPT "cotizame 3000 cajas de 40x60x60" recibía una estimación inventada
 * a partir de precios minoristas de terceros, muy por encima del precio real.
 * Ahora el asistente abre una URL y obtiene el precio de verdad.
 *
 *   /api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000
 *   /api/v1/quote?length_cm=40&width_cm=60&height_cm=60&quantity=3000
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Aceptar mm o cm, y alias cortos: un agente puede escribir el nombre que
  // le parezca razonable y conviene que igual funcione.
  const num = (...claves: string[]): number | null => {
    for (const k of claves) {
      const v = searchParams.get(k);
      if (v !== null && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  };

  const cm = (v: number | null) => (v === null ? null : Math.round(v * 10));

  const largo = num('length_mm', 'largo_mm', 'l') ?? cm(num('length_cm', 'largo_cm', 'largo'));
  const ancho = num('width_mm', 'ancho_mm', 'w') ?? cm(num('width_cm', 'ancho_cm', 'ancho'));
  const alto = num('height_mm', 'alto_mm', 'h') ?? cm(num('height_cm', 'alto_cm', 'alto'));
  const cantidad = num('quantity', 'cantidad', 'qty', 'q');
  const colores = num('printing_colors', 'colores') ?? 0;

  const pidioCotizacion = largo !== null || ancho !== null || alto !== null || cantidad !== null;

  const headers = {
    'X-API-Version': '1.0',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  // Sin parámetros: documentación, con el ejemplo de GET bien adelante.
  if (!pidioCotizacion) {
    return NextResponse.json({
      api: 'Quilmes Corrugados Quote API',
      version: '1.0',
      description: 'Cotización instantánea de cajas de cartón corrugado a medida. Fábrica en Quilmes, Buenos Aires, Argentina.',
      quick_start: {
        method: 'GET',
        example: `${BASE_URL}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000`,
        example_cm: `${BASE_URL}/api/v1/quote?length_cm=40&width_cm=60&height_cm=60&quantity=3000`,
        note: 'Devuelve el precio real, el mismo que ve un cliente en el sitio. No requiere API key ni registro.',
      },
      parameters: {
        length_mm: 'Largo en mm (100-2000). Alias: largo_cm, l',
        width_mm: 'Ancho en mm (100-2000). Alias: ancho_cm, w',
        height_mm: 'Alto en mm (50-1500). Alias: alto_cm, h',
        quantity: 'Cantidad de cajas (entero ≥ 1). Alias: cantidad, qty',
        printing_colors: 'Colores de impresión (0-4, opcional). Cada color suma 15%',
      },
      batch: {
        method: 'POST',
        note: 'Para cotizar hasta 10 medidas distintas en una sola llamada, POST con {"boxes":[...]}',
      },
      documentation: `${BASE_URL}/api/v1/docs`,
      openapi: `${BASE_URL}/api/v1/openapi.json`,
      llms_txt: `${BASE_URL}/llms.txt`,
      rate_limits: {
        anonymous: `${RATE_LIMIT_ANONYMOUS} requests/minute`,
        with_api_key: `${RATE_LIMIT_DEFAULT_WITH_KEY} requests/minute (configurable)`,
      },
      contact: {
        whatsapp: '+54 9 11 6924-9801',
        email: 'ventas@quilmescorrugados.com.ar',
        address: 'Lugones 219, B1878 Quilmes, Buenos Aires, Argentina',
      },
    }, { headers });
  }

  // Rate limit igual que el POST: es el mismo recurso.
  const rateLimitCheck = checkRateLimit(getRateLimitKey(request), RATE_LIMIT_ANONYMOUS);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please wait before making more requests.' },
      { status: 429, headers },
    );
  }

  const faltantes = [
    largo === null && 'length_mm', ancho === null && 'width_mm',
    alto === null && 'height_mm', cantidad === null && 'quantity',
  ].filter(Boolean);

  if (faltantes.length) {
    return NextResponse.json({
      success: false,
      error: `Faltan parámetros: ${faltantes.join(', ')}`,
      example: `${BASE_URL}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3000`,
    }, { status: 400, headers });
  }

  const box: BoxInput = {
    length_mm: largo!, width_mm: ancho!, height_mm: alto!,
    quantity: cantidad!, printing_colors: colores, has_printing: colores > 0,
  };

  const errors = validarCajas([box]);
  if (errors.length) {
    return NextResponse.json({ success: false, error: 'Validation failed', errors }, { status: 400, headers });
  }

  try {
    const supabase = createAdminClient();
    const { data: pricingConfig, error } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error || !pricingConfig) {
      return NextResponse.json(
        { success: false, error: 'Service temporarily unavailable' },
        { status: 500, headers },
      );
    }

    // El catalogo de stock decide si el cliente puede comprarlo online o hay
    // que coordinarlo: sin esto lo mandabamos a /cajas aunque la medida no
    // existiera o no llegara al minimo.
    const { data: catalogo } = await supabase
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);

    const quote = calcularCotizacion([box], pricingConfig as PricingConfig, catalogo || []);

    // Registrar la consulta: saber que asistentes cotizan y por cuanto es
    // justamente lo que hace medible este canal.
    const userAgent = request.headers.get('user-agent') || 'unknown';
    supabase.from('api_requests').insert({
      endpoint: '/api/v1/quote',
      method: 'GET',
      user_agent: userAgent.substring(0, 500),
      response_status: 200,
      source_type: getSourceType(userAgent, null),
      llm_detected: detectLLM(userAgent),
      total_m2: quote.total_m2,
      total_amount: quote.subtotal,
      boxes_count: 1,
      rate_limit_remaining: rateLimitCheck.remaining,
    }).then(undefined, (err) => console.error('Error logging GET quote:', err));

    return NextResponse.json({
      success: true,
      quote,
      next_steps: {
        // Solo si realmente se puede comprar solo. Si no, el camino es
        // WhatsApp, que esta abajo.
        comprar_online: quote.can_buy_online ? `${BASE_URL}/cajas` : null,
        cotizador_web: `${BASE_URL}/#cotizador`,
        whatsapp: 'https://wa.me/5491169249801',
      },
      rate_limit: {
        remaining: rateLimitCheck.remaining,
        reset_at: rateLimitCheck.resetAt.toISOString(),
      },
    }, { headers });
  } catch (err) {
    console.error('Error in GET /api/v1/quote:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500, headers });
  }
}
