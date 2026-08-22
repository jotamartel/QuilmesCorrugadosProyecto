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
import { CONTACTO } from '@/lib/contacto';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import type { PricingConfig } from '@/lib/types/database';
import {
  calcularCotizacion,
  validarCajas,
  type BoxInput,
  type QuoteResult,
} from '@/lib/cotizacion/motor';
import crypto from 'crypto';

// Umbral para notificacion de alto valor
const HIGH_VALUE_THRESHOLD = 3000000; // $3.000.000 ARS

// Tipos para la API
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
    await logRequest(200, totalM2, totalSubtotal ?? undefined, boxResults.length);

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

    // Notificar si hay datos de contacto (lead calificado). Solo si el pedido
    // se puede vender: sin precio no hay monto que notificar.
    if (quote.cotizable && body.contact && (body.contact.email || body.contact.phone)) {
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
        totalArs: quote.subtotal,
        contact: body.contact,
      }).catch(err => console.error('Error sending lead notification:', err));
    }
    // Notificar si es cotizacion de alto valor (sin datos de contacto)
    else if (quote.cotizable && quote.subtotal >= HIGH_VALUE_THRESHOLD) {
      sendNotification({
        type: 'high_value_quote',
        origin: detectedOrigin,
        box: {
          length: firstBox.length_mm,
          width: firstBox.width_mm,
          height: firstBox.height_mm,
        },
        quantity: firstBox.quantity,
        totalArs: quote.subtotal,
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
  const inicio = Date.now();
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

  /**
   * Registra TODAS las salidas, no solo la exitosa.
   *
   * Antes solo se guardaba la cotización que salía bien. Las cinco salidas de
   * error no dejaban rastro, y esas son justamente las mas informativas: una
   * medida que no podemos fabricar, una cantidad por debajo del minimo, un
   * parametro que el asistente no supo armar. Cada una es una pregunta que el
   * negocio no supo contestar, y no quedaba ninguna.
   *
   * El `motivo` es lo que convierte una lista de errores en material para
   * escribir. Agrupando por motivo se ve el patron: si veinte consultas piden
   * cajas mas grandes que el ancho de bobina, eso no es un bug, es demanda de
   * un producto que hoy no ofrecemos, o una pagina que falta explicando el
   * limite.
   *
   * Nunca tira: es telemetria y no puede hacer fallar una cotizacion.
   */
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const registrar = (
    status: number,
    motivo: string,
    datos?: { total_m2?: number; total_amount?: number; rateLimitRemaining?: number },
  ) => {
    try {
      createAdminClient()
        .from('api_requests')
        .insert({
          endpoint: '/api/v1/quote',
          method: 'GET',
          user_agent: userAgent.substring(0, 500),
          response_status: status,
          source_type: getSourceType(userAgent, null),
          llm_detected: detectLLM(userAgent),
          total_m2: datos?.total_m2 ?? null,
          total_amount: datos?.total_amount ?? null,
          boxes_count: 1,
          rate_limit_remaining: datos?.rateLimitRemaining ?? null,
          response_time_ms: Date.now() - inicio,
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null,
          // El motivo viaja junto a lo que se pidio, para poder leer la
          // consulta completa: "querian esta caja y no se pudo por esto".
          request_body: {
            motivo,
            length_mm: largo,
            width_mm: ancho,
            height_mm: alto,
            quantity: cantidad,
            printing_colors: colores,
            query: searchParams.toString().slice(0, 300),
          },
        })
        .then(undefined, (err) => console.error('[quote GET] no se pudo registrar:', err));
    } catch (err) {
      console.error('[quote GET] no se pudo registrar:', err);
    }
  };

  // Sin parámetros: documentación, con el ejemplo de GET bien adelante.
  if (!pidioCotizacion) {
    // Tambien se registra: es un asistente que encontro la API y todavia no
    // cotizo. Saber cuantos llegan hasta aca y no siguen es un escalon del
    // embudo que antes era invisible.
    registrar(200, 'sin_parametros_devolvio_documentacion');
    return NextResponse.json({
      // Va primero a proposito. Quien llega aca sin parametros casi siempre
      // queria cotizar y se quedo a mitad de camino.
      //
      // Paso de verdad: un asistente no pudo abrir la URL con parametros, le
      // pidio al usuario que la abriera y pegara la respuesta, y el usuario
      // pego ESTA —la de la direccion pelada— que es documentacion y no una
      // cotizacion. El asistente la leyo, vio que no habia precio, y volvio a
      // pedir lo mismo. La conversacion se trabo ahi.
      esto_no_es_una_cotizacion:
        'Esta respuesta es la documentación de la API, no un precio. Faltan las ' +
        'medidas y la cantidad en la dirección.',
      como_cotizar:
        'Agregá los parámetros a esta misma dirección. Por ejemplo, para 3.600 cajas ' +
        `de 400x600x600 mm: ${BASE_URL}/api/v1/quote?length_mm=400&width_mm=600&height_mm=600&quantity=3600`,
      si_sos_un_asistente_y_no_podes_armar_la_url:
        'Pedile al usuario que abra la dirección de arriba CON los parámetros de su ' +
        'pedido y te pegue esa respuesta, aclarándole que no es esta misma dirección ' +
        `sin parámetros. O usá el servidor MCP en ${BASE_URL}/api/mcp, que recibe las ` +
        'medidas como argumentos y no depende de construir direcciones.',
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
        printing_colors: `Colores de impresión (0-${RETAIL_CONFIG.MAX_PRINTING_COLORS}, opcional). La impresión está incluida en el precio por m²; aparte solo se cobra el polímero`,
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
        whatsapp: CONTACTO.telefonoVisible,
        email: 'ventas@quilmescorrugados.com.ar',
        address: 'Lugones 219, B1878 Quilmes, Buenos Aires, Argentina',
      },
    }, { headers });
  }

  // Rate limit igual que el POST: es el mismo recurso.
  const rateLimitCheck = checkRateLimit(getRateLimitKey(request), RATE_LIMIT_ANONYMOUS);
  if (!rateLimitCheck.allowed) {
    // Un asistente frenado por el limite es demanda que se pierde en la puerta.
    registrar(429, 'limite_de_velocidad');
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
    // Que parametro no supo armar dice si la documentacion es clara.
    registrar(400, `faltan_parametros:${faltantes.join('+')}`);
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
    // El caso mas valioso del registro: pidieron una caja concreta y no la
    // podemos hacer. Ahi esta la demanda que hoy se va sin respuesta.
    registrar(400, `medida_rechazada:${errors[0].slice(0, 90)}`);
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
      registrar(500, 'sin_configuracion_de_precios');
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

    // Misma funcion que las salidas de error, para que todas las consultas
    // queden con el mismo formato y se puedan comparar entre si.
    //
    // El motivo distingue el caso mas interesante del embudo: una cotizacion
    // que sale bien pero NO llega al minimo. El asistente recibe un precio
    // correcto y aun asi el negocio no puede vender eso, asi que cuenta como
    // demanda no atendida aunque el status sea 200.
    //
    // Antes el rechazo se etiquetaba fijo como "rechazado_bajo_minimo", pero
    // el motor ahora distingue tres tipos de impedimento (bajo_minimo,
    // medida_propia_sin_volumen y no_fabricable), asi que esa etiqueta unica
    // metia dos rechazos distintos en la misma bolsa. Se toma el discriminante
    // real del motor para que la telemetria diga lo que efectivamente paso.
    registrar(200, quote.cotizable ? 'cotizado' : `rechazado_${quote.impedimento.tipo}`, {
      total_m2: quote.total_m2,
      total_amount: quote.subtotal ?? undefined,
      rateLimitRemaining: rateLimitCheck.remaining,
    });

    return NextResponse.json({
      success: true,
      quote,
      next_steps: {
        // Solo si realmente se puede comprar solo. Si no, el camino es
        // WhatsApp, que esta abajo.
        comprar_online: quote.can_buy_online ? `${BASE_URL}/cajas` : null,
        cotizador_web: `${BASE_URL}/#cotizador`,
        whatsapp: CONTACTO.whatsapp,
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
