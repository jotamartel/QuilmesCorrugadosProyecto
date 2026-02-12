import twilio from 'twilio';
import { createAdminClient } from '@/lib/supabase/admin';

// Cliente Twilio - solo se inicializa si hay credenciales configuradas
const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const BUSINESS_PHONE = process.env.WHATSAPP_BUSINESS_NUMBER || '+5491169249801';

// Timeout de conversación (30 minutos por defecto, configurable)
const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000;

// Horario de atención: Lunes a Viernes 7:00 - 16:00 (Argentina)
const BUSINESS_HOURS = {
  start: 7,
  end: 16,
  // 0 = Domingo, 6 = Sábado
  workDays: [1, 2, 3, 4, 5],
};

// Límites de dimensiones (consistente con el resto del sistema)
const LIMITS = {
  maxSheetWidth: 1200,
  minLength: 200,
  minWidth: 200,
  minHeight: 100,
  minQuantity: 100,
};

interface WhatsAppMessage {
  to: string;
  body: string;
}

interface WhatsAppDocumentMessage {
  to: string;
  mediaUrl: string;
}

// Tipo de cliente
export type ClientType = 'particular' | 'empresa';

// Estado de conversacion
export interface ConversationState {
  step: 'initial' | 'waiting_client_type' | 'waiting_name' | 'waiting_company_info' | 'waiting_dimensions' | 'waiting_quantity' | 'waiting_printing' | 'quoted';
  // Datos del cliente
  clientType?: ClientType;
  clientName?: string;
  companyName?: string;
  clientEmail?: string;
  // Datos de cotización
  dimensions?: { length: number; width: number; height: number };
  quantity?: number;
  hasPrinting?: boolean;
  lastInteraction: Date;
  attended?: boolean;
  lastQuoteTotal?: number;
  lastQuoteM2?: number;
}

// Cache en memoria para reducir queries (fallback si Supabase falla)
const memoryCache = new Map<string, ConversationState>();

/**
 * Envía un mensaje de WhatsApp via Twilio
 */
export async function sendWhatsAppMessage({ to, body }: WhatsAppMessage): Promise<boolean> {
  if (!client) {
    console.log('[WhatsApp] Twilio no configurado. Mensaje pendiente:', { to, body: body.substring(0, 50) + '...' });
    return false;
  }

  try {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    await client.messages.create({
      from: TWILIO_NUMBER,
      to: formattedTo,
      body,
    });

    console.log('[WhatsApp] Mensaje enviado a:', to);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Error enviando mensaje:', error);
    return false;
  }
}

/**
 * Envía un documento (PDF) por WhatsApp via Twilio.
 * La URL debe ser pública y accesible (ej: /api/box-template?length=400&width=700&height=280).
 */
export async function sendWhatsAppDocument({
  to,
  mediaUrl,
}: WhatsAppDocumentMessage): Promise<boolean> {
  if (!client) {
    console.log('[WhatsApp] Twilio no configurado. Documento pendiente:', { to, mediaUrl });
    return false;
  }

  try {
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    // WhatsApp no permite body junto con documentos; se envía el texto en un mensaje aparte
    await client.messages.create({
      from: TWILIO_NUMBER,
      to: formattedTo,
      mediaUrl: [mediaUrl],
    });

    console.log('[WhatsApp] Documento enviado a:', to);
    return true;
  } catch (error) {
    console.error('[WhatsApp] Error enviando documento:', error);
    return false;
  }
}

/**
 * Remueve separadores de miles (puntos) de un string numerico
 */
function removeThousandsSeparator(str: string): string {
  return str.replace(/\.(?=\d{3})/g, '');
}

/**
 * Parsea datos de empresa de un mensaje
 * Intenta extraer: nombre de empresa, nombre de contacto, email
 */
export function parseCompanyInfo(message: string): {
  companyName?: string;
  contactName?: string;
  email?: string;
  complete: boolean;
} {
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);

  let companyName: string | undefined;
  let contactName: string | undefined;
  let email: string | undefined;

  // Buscar email
  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w{2,}/i);
  if (emailMatch) {
    email = emailMatch[0].toLowerCase();
  }

  // Intentar parsear por líneas o patrones
  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Detectar empresa
    if (lineLower.includes('empresa:') || lineLower.includes('empresa ')) {
      companyName = line.replace(/empresa:?\s*/i, '').trim();
    }
    // Detectar nombre de contacto
    else if (lineLower.includes('nombre:') || lineLower.includes('contacto:')) {
      contactName = line.replace(/nombre:?\s*|contacto:?\s*/i, '').trim();
    }
    // Detectar email en línea
    else if (lineLower.includes('email:') || lineLower.includes('mail:')) {
      const emailInLine = line.match(/[\w.-]+@[\w.-]+\.\w{2,}/i);
      if (emailInLine) {
        email = emailInLine[0].toLowerCase();
      }
    }
    // Si la línea parece un nombre de empresa (primera línea sin @ y sin patrones de nombre)
    else if (!companyName && !line.includes('@') && lines.indexOf(line) === 0) {
      // Verificar si parece nombre de empresa (mayúsculas, SA, SRL, etc)
      if (/\b(sa|srl|sas|s\.a\.|s\.r\.l\.|s\.a\.s\.|inc|corp|ltd|empresa|fabrica|comercial|industria)/i.test(line) ||
          /^[A-Z]/.test(line)) {
        companyName = line;
      }
    }
  }

  // Si no encontró empresa pero hay texto significativo, usar primera línea
  if (!companyName && lines.length > 0 && !lines[0].includes('@')) {
    companyName = lines[0];
  }

  // Buscar nombre de contacto si no lo encontró
  if (!contactName && lines.length > 1) {
    // Buscar línea que parezca nombre de persona
    for (const line of lines.slice(1)) {
      if (!line.includes('@') && !/\b(sa|srl|sas|empresa|fabrica|comercial)/i.test(line)) {
        contactName = line;
        break;
      }
    }
  }

  // Determinar si tenemos suficiente info
  const complete = !!(companyName && contactName && email);

  return { companyName, contactName, email, complete };
}

/**
 * Parsea un mensaje para extraer dimensiones de caja
 */
export function parseBoxDimensions(message: string): {
  length?: number;
  width?: number;
  height?: number;
  quantity?: number;
  /** true si se interpretaron como cm y se convirtieron a mm */
  convertedFromCm?: boolean;
} | null {
  const text = message.toLowerCase();

  const dimPatterns = [
    /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i,
    /largo\s*:?\s*(\d+).*ancho\s*:?\s*(\d+).*alto\s*:?\s*(\d+)/i,
    /l\s*:?\s*(\d+).*a\s*:?\s*(\d+).*h\s*:?\s*(\d+)/i,
  ];

  let length: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  const hasExplicitCm = /\b(cm|cent[ií]metros?)\b/i.test(text);
  let convertedFromCm = false;

  for (const pattern of dimPatterns) {
    const match = text.match(pattern);
    if (match) {
      let [, l, w, h] = match.map(Number);

      if (hasExplicitCm || (l < 100 && w < 100 && h < 100)) {
        l *= 10;
        w *= 10;
        h *= 10;
        convertedFromCm = true;
      }

      length = l;
      width = w;
      height = h;
      break;
    }
  }

  const qtyPatterns = [
    /(\d{1,3}(?:\.\d{3})*|\d+)\s*(unidades|cajas|piezas|u\.)/i,
    /cantidad\s*:?\s*(\d{1,3}(?:\.\d{3})*|\d+)/i,
    /necesito\s*(\d{1,3}(?:\.\d{3})*|\d+)/i,
    /(\d{2,})\s+(?=\d+\s*[x×]\s*\d+\s*[x×]\s*\d+)/i,
  ];

  let quantity: number | undefined;
  for (const pattern of qtyPatterns) {
    const match = text.match(pattern);
    if (match) {
      quantity = Number(removeThousandsSeparator(match[1]));
      break;
    }
  }

  if (length || width || height || quantity) {
    return { length, width, height, quantity, convertedFromCm };
  }

  return null;
}

/**
 * Obtiene el estado de conversacion desde Supabase
 */
export async function getConversationState(phoneNumber: string): Promise<ConversationState> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error || !data) {
      // No existe, retornar estado inicial
      return { step: 'initial', lastInteraction: new Date() };
    }

    // Verificar timeout
    const lastInteraction = new Date(data.last_interaction);
    if (Date.now() - lastInteraction.getTime() > CONVERSATION_TIMEOUT_MS) {
      // Expiró, resetear
      await clearConversationState(phoneNumber);
      return { step: 'initial', lastInteraction: new Date() };
    }

    return {
      step: data.step as ConversationState['step'],
      // Datos del cliente
      clientType: data.client_type as ClientType | undefined,
      clientName: data.client_name ?? undefined,
      companyName: data.company_name ?? undefined,
      clientEmail: data.client_email ?? undefined,
      // Datos de cotización
      dimensions: data.dimensions as ConversationState['dimensions'],
      quantity: data.quantity ?? undefined,
      hasPrinting: data.has_printing ?? undefined,
      lastInteraction,
      attended: data.attended,
      lastQuoteTotal: data.last_quote_total ? Number(data.last_quote_total) : undefined,
      lastQuoteM2: data.last_quote_m2 ? Number(data.last_quote_m2) : undefined,
    };
  } catch (error) {
    console.error('[WhatsApp] Error obteniendo estado de Supabase:', error);
    // Fallback a memoria
    const cached = memoryCache.get(phoneNumber);
    if (cached && Date.now() - cached.lastInteraction.getTime() <= CONVERSATION_TIMEOUT_MS) {
      return cached;
    }
    return { step: 'initial', lastInteraction: new Date() };
  }
}

/**
 * Actualiza el estado de conversacion en Supabase
 */
export async function updateConversationState(
  phoneNumber: string,
  update: Partial<ConversationState>
): Promise<void> {
  const now = new Date();

  try {
    const supabase = createAdminClient();

    const dbUpdate: Record<string, unknown> = {
      last_interaction: now.toISOString(),
    };

    if (update.step !== undefined) dbUpdate.step = update.step;
    // Datos del cliente
    if (update.clientType !== undefined) dbUpdate.client_type = update.clientType;
    if (update.clientName !== undefined) dbUpdate.client_name = update.clientName;
    if (update.companyName !== undefined) dbUpdate.company_name = update.companyName;
    if (update.clientEmail !== undefined) dbUpdate.client_email = update.clientEmail;
    // Datos de cotización
    if (update.dimensions !== undefined) dbUpdate.dimensions = update.dimensions;
    if (update.quantity !== undefined) dbUpdate.quantity = update.quantity;
    if (update.hasPrinting !== undefined) dbUpdate.has_printing = update.hasPrinting;
    if (update.lastQuoteTotal !== undefined) dbUpdate.last_quote_total = update.lastQuoteTotal;
    if (update.lastQuoteM2 !== undefined) dbUpdate.last_quote_m2 = update.lastQuoteM2;

    const { error } = await supabase
      .from('whatsapp_conversations')
      .upsert({
        phone_number: phoneNumber,
        ...dbUpdate,
      }, {
        onConflict: 'phone_number',
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('[WhatsApp] Error actualizando estado en Supabase:', error);
  }

  // Siempre actualizar cache local
  const current = memoryCache.get(phoneNumber) || { step: 'initial' as const, lastInteraction: new Date() };
  memoryCache.set(phoneNumber, {
    ...current,
    ...update,
    lastInteraction: now,
  });
}

/**
 * Limpia el estado de conversacion
 */
export async function clearConversationState(phoneNumber: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    await supabase
      .from('whatsapp_conversations')
      .update({
        step: 'initial',
        client_type: null,
        client_name: null,
        company_name: null,
        client_email: null,
        dimensions: null,
        quantity: null,
        has_printing: null,
        last_interaction: new Date().toISOString(),
      })
      .eq('phone_number', phoneNumber);
  } catch (error) {
    console.error('[WhatsApp] Error limpiando estado:', error);
  }

  memoryCache.delete(phoneNumber);
}

/**
 * Marca una conversación como atendida
 */
export async function markConversationAttended(
  phoneNumber: string,
  attendedBy?: string,
  notes?: string
): Promise<boolean> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({
        attended: true,
        attended_at: new Date().toISOString(),
        attended_by: attendedBy,
        notes: notes,
      })
      .eq('phone_number', phoneNumber);

    return !error;
  } catch (error) {
    console.error('[WhatsApp] Error marcando como atendida:', error);
    return false;
  }
}

/**
 * Verifica si estamos dentro del horario de atención
 */
export function isWithinBusinessHours(): boolean {
  // Usar hora de Argentina (UTC-3)
  const now = new Date();
  const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

  const dayOfWeek = argentinaTime.getDay();
  const hour = argentinaTime.getHours();

  return BUSINESS_HOURS.workDays.includes(dayOfWeek) &&
         hour >= BUSINESS_HOURS.start &&
         hour < BUSINESS_HOURS.end;
}

/**
 * Obtiene el historial de cotizaciones de un número
 */
export async function getPhoneQuoteHistory(phoneNumber: string): Promise<{
  totalQuotes: number;
  lastQuote?: { total: number; m2: number; date: Date };
}> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('communications')
      .select('metadata, created_at')
      .eq('channel', 'whatsapp')
      .eq('metadata->>phone', phoneNumber)
      .not('metadata->quote', 'is', null)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return { totalQuotes: 0 };
    }

    const lastQuoteData = data[0].metadata as { quote?: { total: number; totalM2: number } };

    return {
      totalQuotes: data.length,
      lastQuote: lastQuoteData.quote ? {
        total: lastQuoteData.quote.total,
        m2: lastQuoteData.quote.totalM2,
        date: new Date(data[0].created_at),
      } : undefined,
    };
  } catch (error) {
    console.error('[WhatsApp] Error obteniendo historial:', error);
    return { totalQuotes: 0 };
  }
}

/**
 * Valida las dimensiones contra los limites del sistema
 */
export function validateDimensions(length: number, width: number, height: number): {
  valid: boolean;
  error?: string;
} {
  const sheetWidth = height + width;

  if (sheetWidth > LIMITS.maxSheetWidth) {
    return {
      valid: false,
      error: `Esas medidas exceden nuestro limite de produccion.\n\nEl ancho de plancha (Alto + Ancho = ${sheetWidth}mm) no puede superar ${LIMITS.maxSheetWidth}mm.\n\nPor favor, indica otras medidas o escribe "asesor" para hablar con alguien.`,
    };
  }

  if (length < LIMITS.minLength || width < LIMITS.minWidth || height < LIMITS.minHeight) {
    return {
      valid: false,
      error: `Las medidas minimas son ${LIMITS.minLength}x${LIMITS.minWidth}x${LIMITS.minHeight}mm.\n\nPor favor, indica medidas mayores.`,
    };
  }

  return { valid: true };
}

/**
 * Genera mensaje de bienvenida inicial - pregunta tipo de cliente
 */
export function getWelcomeMessage(isReturningCustomer: boolean = false, lastQuote?: { total: number; m2: number }): string {
  if (isReturningCustomer && lastQuote) {
    return `Hola de nuevo! Soy el asistente de Quilmes Corrugados.

Veo que cotizaste anteriormente ($${lastQuote.total.toLocaleString('es-AR')} - ${lastQuote.m2.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m2).

Queres cotizar de nuevo? Para empezar, contame:

Sos particular o empresa?

1 - Particular
2 - Empresa`;
  }

  return `Hola! Soy el asistente de Quilmes Corrugados.

Para darte una cotizacion, primero necesito algunos datos.

Sos particular o empresa?

1 - Particular
2 - Empresa`;
}

/**
 * Genera mensaje pidiendo nombre (para particulares)
 */
export function getNameMessage(): string {
  return `Perfecto! Por favor, indicame tu nombre completo.`;
}

/**
 * Genera mensaje pidiendo datos de empresa
 */
export function getCompanyInfoMessage(): string {
  return `Perfecto! Por favor, indicame:

- Nombre de la empresa
- Tu nombre de contacto
- Email de contacto

Podes enviarlo en un solo mensaje o por separado.`;
}

/**
 * Genera mensaje confirmando datos y pidiendo dimensiones
 */
export function getDataConfirmedMessage(clientType: ClientType, name: string, companyName?: string): string {
  if (clientType === 'empresa' && companyName) {
    return `Gracias ${name}! Registrado para ${companyName}.

Ahora si, indicame las medidas de la caja en mm o cm:

Formato: Largo x Ancho x Alto
Ejemplo: 400x300x300 o 40x30x30 cm`;
  }

  return `Gracias ${name}!

Ahora si, indicame las medidas de la caja en mm o cm:

Formato: Largo x Ancho x Alto
Ejemplo: 400x300x300 o 40x30x30 cm`;
}

/**
 * Genera mensaje pidiendo cantidad
 */
export function getQuantityMessage(length: number, width: number, height: number): string {
  return `Caja: ${length} x ${width} x ${height} mm

Cuantas unidades necesitas?

Minimo recomendado: cantidad que sume 3.000 m2`;
}

/**
 * Genera mensaje pidiendo impresion
 */
export function getPrintingMessage(quantity: number): string {
  return `Cantidad: ${quantity.toLocaleString('es-AR')} unidades

Llevan impresion?

1 - Sin impresion (lisa)
2 - Con impresion (hasta 3 colores)`;
}

/**
 * Genera mensaje de cotizacion
 */
export function getQuoteMessage(
  dimensions: { length: number; width: number; height: number },
  quantity: number,
  hasPrinting: boolean,
  quote: { total: number; totalM2: number; deliveryDays: number }
): string {
  const boxDesc = `${dimensions.length}x${dimensions.width}x${dimensions.height}mm`;
  const unitPrice = Math.round(quote.total / quantity);

  let message = `COTIZACION QUILMES CORRUGADOS

Caja: ${boxDesc} ${hasPrinting ? '(con impresion)' : '(lisa)'}
Cantidad: ${quantity.toLocaleString('es-AR')} unidades
Total m2: ${quote.totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 })}

Total: $${quote.total.toLocaleString('es-AR')}
Precio unitario: $${unitPrice.toLocaleString('es-AR')}

Tiempo de entrega: ${quote.deliveryDays} dias habiles
Validez: 7 dias`;

  if (quote.totalM2 < 3000) {
    message += '\n\n(Pedido menor al minimo recomendado de 3000 m2)';
  }

  if (hasPrinting) {
    message += `

Te enviamos el desplegado de la caja en el siguiente mensaje para que incorpores tu diseño. Las areas verdes indican donde cargar el logo.`;
  }

  message += `

Queres confirmar el pedido?

1 - Confirmar (te contacta un vendedor)
2 - Modificar medidas
3 - Hablar con un asesor`;

  return message;
}

/**
 * Genera mensaje de confirmacion
 */
export function getConfirmationMessage(): string {
  return `Perfecto! Un vendedor te va a contactar en breve para confirmar los detalles.

Horario de atencion: Lunes a Viernes 7:00 - 16:00

Necesitas algo mas? Escribe "cotizar" para una nueva cotizacion.`;
}

/**
 * Genera mensaje de contacto con asesor
 */
export function getAdvisorMessage(): string {
  return `Te comunicamos con un asesor.

Mientras tanto, podes llamar o escribir a:
WhatsApp: ${BUSINESS_PHONE}
Email: ventas@quilmescorrugados.com.ar

Horario: Lunes a Viernes 7:00 - 16:00`;
}

/**
 * Genera mensaje sobre envíos
 */
export function getShippingMessage(hasQuoted: boolean = false): string {
  const baseMessage = `Si, hacemos envios a todo el pais!

El envio es GRATIS dentro de un radio de 60km de nuestra fabrica en Quilmes, en compras superiores a 3.000 m2.

Para otras zonas o cantidades menores, consultanos por el costo de envio.`;

  if (hasQuoted) {
    return baseMessage + `

Necesitas algo mas sobre tu cotizacion?`;
  }

  return baseMessage + `

Queres cotizar? Escribi "cotizar" para empezar.`;
}

/**
 * Genera mensaje fuera de horario
 */
export function getOutOfHoursMessage(): string {
  return `Hola! Gracias por escribir a Quilmes Corrugados.

Estamos fuera de horario de atencion.
Nuestro horario es: Lunes a Viernes 7:00 - 16:00

Deja tu mensaje y te respondemos a la brevedad.

O si queres una cotizacion rapida, escribi "cotizar" y nuestro asistente automatico te ayuda.`;
}

/**
 * Genera mensaje para media no soportada (audio/imagen)
 */
export function getUnsupportedMediaMessage(): string {
  return `No puedo procesar audios ni imagenes.

Por favor, escribi tu consulta como texto.

Escribe "cotizar" para una cotizacion o "asesor" para hablar con alguien.`;
}

/**
 * Verifica si WhatsApp esta configurado
 */
export function isWhatsAppEnabled(): boolean {
  return !!client;
}

/**
 * Obtiene el numero de WhatsApp del negocio
 */
export function getBusinessPhone(): string {
  return BUSINESS_PHONE;
}
