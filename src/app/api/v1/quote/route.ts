/**
 * API Pública v1: /api/v1/quote
 * Endpoint para LLMs y agentes de IA
 *
 * Rate Limits:
 * - Sin API key: 10 requests/minuto
 * - Con API key: 100 requests/minuto (según configuración)
 *
 * Documentación: https://quilmes-corrugados.vercel.app/api/v1/docs
 * OpenAPI Spec: https://quilmes-corrugados.vercel.app/api/v1/openapi.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal, getProductionDays } from '@/lib/utils/pricing';
import { sendNotification } from '@/lib/notifications';
import type { PricingConfig } from '@/lib/types/database';
import crypto from 'crypto';

// Umbral para notificacion de alto valor
const HIGH_VALUE_THRESHOLD = 500000; // $500.000 ARS

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

function detectLLM(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();

  if (ua.includes('gptbot') || ua.includes('chatgpt')) return 'gpt';
  if (ua.includes('claude') || ua.includes('anthropic')) return 'claude';
  if (ua.includes('perplexity')) return 'perplexity';
  if (ua.includes('cohere')) return 'cohere';
  if (ua.includes('gemini') || ua.includes('google-extended')) return 'gemini';
  if (ua.includes('bingbot')) return 'bing';

  return null;
}

function getSourceType(userAgent: string, apiKey: string | null): string {
  if (detectLLM(userAgent)) return 'llm';
  if (apiKey) return 'api_client';
  if (userAgent.includes('Mozilla') || userAgent.includes('Chrome') || userAgent.includes('Safari')) {
    return 'browser';
  }
  return 'unknown';
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
    const errors: string[] = [];
    body.boxes.forEach((box, index) => {
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
    const MINIMUM_M2 = 3000;

    // Calcular cada caja
    const boxResults: BoxResult[] = [];
    let totalM2 = 0;
    let totalSubtotal = 0;
    let maxEstimatedDays = 0;
    let hasPrinting = false;

    for (const box of body.boxes) {
      const printingColors = box.printing_colors || 0;
      const boxHasPrinting = box.has_printing || printingColors > 0;

      if (boxHasPrinting) hasPrinting = true;

      // Calcular plancha desplegada
      const unfolded = calculateUnfolded(box.length_mm, box.width_mm, box.height_mm);

      // Calcular m² totales para esta caja
      const boxTotalSqm = calculateTotalM2(unfolded.m2, box.quantity);
      totalM2 += boxTotalSqm;

      // Obtener precio por m² según volumen total
      const pricePerM2 = getPricePerM2(boxTotalSqm, config);

      // Aplicar incremento por impresión
      let adjustedPricePerM2 = pricePerM2;
      if (boxHasPrinting && printingColors > 0) {
        // +15% por cada color de impresión
        const printingMultiplier = 1 + (printingColors * 0.15);
        adjustedPricePerM2 = pricePerM2 * printingMultiplier;
      }

      // Calcular subtotal
      const subtotal = calculateSubtotal(boxTotalSqm, adjustedPricePerM2);
      totalSubtotal += subtotal;

      // Precio unitario
      const unitPrice = Math.round((subtotal / box.quantity) * 100) / 100;

      // Días de producción
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
        unit_price: unitPrice,
        subtotal: subtotal,
      });
    }

    // Redondear totales
    totalM2 = Math.round(totalM2 * 100) / 100;
    totalSubtotal = Math.round(totalSubtotal * 100) / 100;

    // Fecha de validez (30 días)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const quote: QuoteResult = {
      boxes: boxResults,
      total_m2: totalM2,
      subtotal: totalSubtotal,
      currency: 'ARS',
      estimated_days: maxEstimatedDays,
      valid_until: validUntil.toISOString().split('T')[0],
      minimum_m2: MINIMUM_M2,
      meets_minimum: totalM2 >= MINIMUM_M2,
    };

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// Handler para GET (documentación)
export async function GET() {
  return NextResponse.json({
    api: 'Quilmes Corrugados Quote API',
    version: '1.0',
    documentation: 'https://quilmes-corrugados.vercel.app/api/v1/docs',
    openapi: 'https://quilmes-corrugados.vercel.app/api/v1/openapi.json',
    endpoints: {
      'POST /api/v1/quote': 'Calculate quote for cardboard boxes',
    },
    rate_limits: {
      anonymous: `${RATE_LIMIT_ANONYMOUS} requests/minute`,
      with_api_key: `${RATE_LIMIT_DEFAULT_WITH_KEY} requests/minute (configurable)`,
    },
    authentication: {
      header: 'X-API-Key',
      description: 'Contact us for an API key with higher rate limits',
    },
    contact: 'info@quilmescorrugados.com.ar',
  });
}
