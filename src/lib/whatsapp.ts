import twilio from 'twilio';

// Cliente Twilio - solo se inicializa si hay credenciales configuradas
const client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const BUSINESS_PHONE = process.env.WHATSAPP_BUSINESS_NUMBER || '+5491169249801';

// Límites de dimensiones (consistente con el resto del sistema)
const LIMITS = {
  maxSheetWidth: 1200, // H + A no puede superar esto
  minLength: 200,
  minWidth: 200,
  minHeight: 100,
  minQuantity: 100,
};

interface WhatsAppMessage {
  to: string;
  body: string;
}

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
 * Parsea un mensaje para extraer dimensiones de caja
 */
export function parseBoxDimensions(message: string): {
  length?: number;
  width?: number;
  height?: number;
  quantity?: number;
} | null {
  const text = message.toLowerCase();

  // Patrones para dimensiones: "40x30x25", "400x300x250", "40 x 30 x 25"
  const dimPatterns = [
    /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/i,
    /largo\s*:?\s*(\d+).*ancho\s*:?\s*(\d+).*alto\s*:?\s*(\d+)/i,
    /l\s*:?\s*(\d+).*a\s*:?\s*(\d+).*h\s*:?\s*(\d+)/i,
  ];

  let length: number | undefined;
  let width: number | undefined;
  let height: number | undefined;

  for (const pattern of dimPatterns) {
    const match = text.match(pattern);
    if (match) {
      let [, l, w, h] = match.map(Number);

      // Si las medidas son muy chicas, probablemente estan en cm
      if (l < 100 && w < 100 && h < 100) {
        l *= 10;
        w *= 10;
        h *= 10;
      }

      length = l;
      width = w;
      height = h;
      break;
    }
  }

  // Buscar cantidad
  const qtyPatterns = [
    /(\d+)\s*(unidades|cajas|piezas|u\.)/i,
    /cantidad\s*:?\s*(\d+)/i,
    /necesito\s*(\d+)/i,
  ];

  let quantity: number | undefined;
  for (const pattern of qtyPatterns) {
    const match = text.match(pattern);
    if (match) {
      quantity = Number(match[1]);
      break;
    }
  }

  if (length || width || height || quantity) {
    return { length, width, height, quantity };
  }

  return null;
}

// Estado de conversacion por numero
interface ConversationState {
  step: 'initial' | 'waiting_dimensions' | 'waiting_quantity' | 'waiting_printing' | 'quoted';
  dimensions?: { length: number; width: number; height: number };
  quantity?: number;
  hasPrinting?: boolean;
  lastInteraction: Date;
}

const conversations = new Map<string, ConversationState>();

/**
 * Obtiene el estado de conversacion para un numero
 * Resetea si pasaron mas de 30 minutos
 */
export function getConversationState(phoneNumber: string): ConversationState {
  const state = conversations.get(phoneNumber);

  // Si pasaron mas de 30 minutos, resetear
  if (state && Date.now() - state.lastInteraction.getTime() > 30 * 60 * 1000) {
    conversations.delete(phoneNumber);
    return { step: 'initial', lastInteraction: new Date() };
  }

  return state || { step: 'initial', lastInteraction: new Date() };
}

/**
 * Actualiza el estado de conversacion
 */
export function updateConversationState(phoneNumber: string, update: Partial<ConversationState>): void {
  const current = getConversationState(phoneNumber);
  conversations.set(phoneNumber, {
    ...current,
    ...update,
    lastInteraction: new Date(),
  });
}

/**
 * Limpia el estado de conversacion
 */
export function clearConversationState(phoneNumber: string): void {
  conversations.delete(phoneNumber);
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
 * Genera mensaje de bienvenida
 */
export function getWelcomeMessage(): string {
  return `Hola! Soy el asistente de Quilmes Corrugados.

Para cotizarte, necesito las medidas de la caja.

Indicame las medidas en mm o cm:
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
