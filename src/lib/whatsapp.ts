import { createAdminClient } from '@/lib/supabase/admin';
import { transporte } from '@/lib/whatsapp-transporte';
import type { Plantilla } from '@/lib/whatsapp-plantillas';
import { CONTACTO } from '@/lib/contacto';
import { HORARIO, RETAIL_CONFIG, ENVIO } from '@/lib/retail/config';
import { SITE_URL } from '@/lib/site';
import {
  precioUnitarioARS,
  mensajeDeImpedimento,
  porQueNoSeFabrica,
  type QuoteResult,
} from '@/lib/cotizacion/motor';
import { calculateUnfolded } from '@/lib/utils/box-calculations';

const BUSINESS_PHONE = process.env.WHATSAPP_BUSINESS_NUMBER || CONTACTO.tel;

// Timeout de conversación (30 minutos por defecto, configurable)
const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000;

// Horario de atencion, desde HORARIO en retail/config. Antes estaba escrito
// aca en 7-16 mientras el sitio y el JSON-LD decian 8-17.
const BUSINESS_HOURS = {
  start: HORARIO.desde,
  end: HORARIO.hasta,
  // 0 = Domingo, 6 = Sábado
  workDays: [...HORARIO.dias] as number[],
};

// Los limites de fabricacion ya no viven aca: los decide porQueNoSeFabrica() en
// el motor, que es la misma funcion que usa la web. Esta copia local no tenia la
// medida maxima, asi que por WhatsApp entraban cajas que la fabrica no hace.

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
 * Envía un mensaje de WhatsApp por el proveedor activo.
 * Cuál es sale de WHATSAPP_PROVEEDOR: ver src/lib/whatsapp-transporte/.
 */
export async function sendWhatsAppMessage({ to, body }: WhatsAppMessage): Promise<boolean> {
  const ok = await transporte.enviarTexto(to, body);
  if (ok) console.log('[WhatsApp] mensaje enviado por %s a %s', transporte.nombre, to);
  return ok;
}

/**
 * Envía un documento (PDF) por WhatsApp.
 * La URL debe ser pública y accesible (ej: /api/box-template?length=400&width=700&height=280).
 */
export async function sendWhatsAppDocument({
  to,
  mediaUrl,
}: WhatsAppDocumentMessage): Promise<boolean> {
  const ok = await transporte.enviarDocumento(to, mediaUrl);
  if (ok) console.log('[WhatsApp] documento enviado por %s a %s', transporte.nombre, to);
  return ok;
}

/**
 * Manda una plantilla aprobada por Meta.
 *
 * Es la unica forma de escribirle a alguien que hace mas de 24 horas que no
 * escribe. El resultado distingue tres cosas, porque quien atiende necesita
 * saber cual de las tres le paso:
 *
 *   'enviada'          — salio; cuando el cliente conteste se abre la ventana
 *   'sin_soporte'      — el proveedor actual no manda plantillas (Twilio)
 *   'error'            — Meta la rechazo: nombre, idioma o aprobacion
 */
export async function enviarPlantillaWhatsApp(
  telefono: string,
  plantilla: Plantilla,
  variables: string[] = [],
): Promise<'enviada' | 'sin_soporte' | 'error'> {
  if (!transporte.enviarPlantilla) {
    console.error(
      '[WhatsApp] %s no manda plantillas: no se puede reabrir la conversacion con %s',
      transporte.nombre, telefono,
    );
    return 'sin_soporte';
  }

  const ok = await transporte.enviarPlantilla(telefono, {
    nombre: plantilla.nombre,
    idioma: plantilla.idioma,
    variables,
  });

  if (ok) {
    console.log('[WhatsApp] plantilla "%s" enviada a %s', plantilla.nombre, telefono);
    return 'enviada';
  }
  return 'error';
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

  // Usar la ÚLTIMA ocurrencia de dimensiones (correcciones del usuario: "450 no 45" → "450x380x450")
  for (const pattern of dimPatterns) {
    const matches = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
    const lastMatch = matches[matches.length - 1];
    if (lastMatch) {
      let [, l, w, h] = lastMatch.map(Number);

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

  // Cantidad. Cada patron termina en un limite de palabra a proposito: sin eso
  // el motor de regex retrocede DENTRO de un numero y parte una medida al medio.
  //
  // El primero era /...(\d+)\s*[,.;]?\s*(\d{2,})/ y con "2600 cajas de
  // 300x380x420" el tercer grupo cedia hasta "4" para dejarle "20" a la
  // cantidad: el bot cotizaba 20 cajas en vez de 2.600. Con "500 cajas de
  // 400x300x300" cedia los dos ceros y la cantidad quedaba en 0. El \b entre
  // el alto y lo que sigue lo impide, porque entre dos digitos no hay limite
  // de palabra y el retroceso deja de ser posible.
  //
  // El grupo de miles va con + y no con *: con * la primera alternativa
  // matchea tres digitos sueltos, tiene exito, y da por buena una cantidad
  // truncada. Es el mismo error que tenia el webhook con "2600 unidades".
  const qtyPatterns = [
    // "300x380x420, 2600" — la cantidad despues de las medidas
    /(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\b[\s,;]+(\d{1,3}(?:\.\d{3})+|\d+)\b(?!\s*[x×])/i,
    // "2600 cajas", "1.500 unidades"
    /(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:unidades|cajas|piezas|u\.)\b/i,
    // "cantidad: 2600"
    /cantidad\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d+)\b/i,
    // "necesito 500" — el verbo antes del numero. La mirada adelante evita que
    // "necesito 300x380x420" tome el largo como cantidad.
    /(?:quiero|necesito|preciso|dame|serian|ser[ií]an|son)\s+(?:unas?\s+)?(\d{1,3}(?:\.\d{3})+|\d+)\b(?!\s*[x×])/i,
    // "2600 quiero"
    /(\d{1,3}(?:\.\d{3})+|\d+)\s+(?:quiero|necesito|mas|más|menos)\b/i,
    // "2600 300x380x420" — la cantidad antes de las medidas
    /(\d{1,3}(?:\.\d{3})+|\d+)\s+(?=\d+\s*[x×]\s*\d+\s*[x×]\s*\d+)/i,
  ];

  let quantity: number | undefined;
  for (const pattern of qtyPatterns) {
    const matches = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
    const lastMatch = matches[matches.length - 1];
    if (lastMatch) {
      const qtyStr = lastMatch[4] || lastMatch[1];
      quantity = Number(removeThousandsSeparator(qtyStr));
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
 * El traspaso de una conversacion del asistente a una persona.
 *
 * Es una fecha y no un booleano a proposito: una pausa que no vence sola se
 * queda prendida. Alguien atiende, se olvida de devolverle la conversacion al
 * asistente, y esa linea queda muda para siempre sin hacer ruido. Con una fecha,
 * si nadie contesta el asistente vuelve y el cliente al menos recibe algo.
 */

/** Cuanto se calla el asistente cuando una persona escribe desde el panel. */
export const PAUSA_POR_RESPUESTA_HUMANA_MS = 24 * 60 * 60 * 1000;

/**
 * Cuanto se calla cuando el propio asistente deriva a una persona.
 *
 * Mas corta que la anterior: nadie tomo la conversacion todavia, solo se pidio.
 * Si en ese rato no contesta nadie, conviene que el asistente vuelva a estar
 * disponible antes que dejar al cliente hablando solo.
 */
export const PAUSA_TRAS_DERIVAR_MS = 3 * 60 * 60 * 1000;

/** Calla al asistente en esta conversacion por el tiempo indicado. */
export async function pausarAsistente(
  phoneNumber: string,
  duracionMs: number,
  quien?: string,
): Promise<Date | null> {
  const hasta = new Date(Date.now() + duracionMs);
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('whatsapp_conversations')
      .upsert(
        {
          phone_number: phoneNumber,
          bot_pausado_hasta: hasta.toISOString(),
          ...(quien ? { attended: true, attended_at: new Date().toISOString(), attended_by: quien } : {}),
        },
        { onConflict: 'phone_number' },
      );
    if (error) {
      console.error('[WhatsApp] No se pudo pausar el asistente:', error);
      return null;
    }
    return hasta;
  } catch (error) {
    console.error('[WhatsApp] No se pudo pausar el asistente:', error);
    return null;
  }
}

/** Le devuelve la conversacion al asistente. */
export async function reanudarAsistente(phoneNumber: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ bot_pausado_hasta: null })
      .eq('phone_number', phoneNumber);
    if (error) {
      console.error('[WhatsApp] No se pudo reanudar el asistente:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[WhatsApp] No se pudo reanudar el asistente:', error);
    return false;
  }
}

/**
 * Si hay una persona atendiendo esta conversacion ahora mismo.
 *
 * Ante un error de lectura devuelve false —o sea, el asistente contesta—. Es la
 * eleccion menos mala: que el bot hable de mas es molesto, que un cliente quede
 * sin respuesta porque la base tuvo un hipo es peor.
 */
export async function asistentePausado(phoneNumber: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('bot_pausado_hasta')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (error || !data?.bot_pausado_hasta) return false;
    return new Date(data.bot_pausado_hasta).getTime() > Date.now();
  } catch {
    return false;
  }
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
  // Los limites salen del motor, no de una copia local.
  //
  // Aca estaban escritos a mano el ancho de rollo y las medidas minimas, pero
  // NO la medida maxima —2000x2000x1500—, que si esta en el motor. Resultado:
  // por WhatsApp se aceptaba una caja de 2500x900x400, se seguia el flujo
  // preguntandole la cantidad, y recien mucho despues —o nunca— se enteraba de
  // que esa caja no se fabrica. Con porQueNoSeFabrica() los tres limites son
  // exactamente los mismos que usa la web.
  const motivos = porQueNoSeFabrica({
    length_mm: length,
    width_mm: width,
    height_mm: height,
    quantity: 1,
  });

  if (motivos.length > 0) {
    return {
      valid: false,
      error:
        `Esa caja no la podemos fabricar: ${motivos.join('; y ')}.\n\n` +
        `Pasame otras medidas y la cotizamos.`,
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

Minimo de compra: ${RETAIL_CONFIG.MIN_M2_PEDIDO} m2 de carton, que con esta medida son ${Math.ceil(RETAIL_CONFIG.MIN_M2_PEDIDO / calculateUnfolded(length, width, height).m2).toLocaleString('es-AR')} cajas`;
}

/**
 * Genera mensaje pidiendo impresion
 */
export function getPrintingMessage(quantity: number): string {
  return `Cantidad: ${quantity.toLocaleString('es-AR')} unidades

Llevan impresion?

1 - Sin impresion (lisa)
2 - Con impresion (hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores)`;
}

/**
 * Genera mensaje de cotizacion
 */
export function getQuoteMessage(
  dimensions: { length: number; width: number; height: number },
  quantity: number,
  cotizacion: QuoteResult,
): string {
  const boxDesc = `${dimensions.length}x${dimensions.width}x${dimensions.height}mm`;
  const colores = cotizacion.boxes[0].printing_colors;
  const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

  // El detalle de impresion dice cuantos colores, no un "si" pelado: antes el
  // bot cobraba el recargo de un color sin haber preguntado nunca cuantos.
  const impresion = colores > 0
    ? `(impresion ${colores} ${colores === 1 ? 'color' : 'colores'})`
    : '(lisa)';

  // Sin precio no hay cotizacion. El minimo de compra es excluyente: no se
  // manda un numero "de referencia" con la aclaracion al pie, porque eso
  // abre la negociacion de cantidad que el minimo existe para evitar.
  if (!cotizacion.cotizable) {
    const imp = cotizacion.impedimento;
    return `QUILMES CORRUGADOS

Caja: ${boxDesc}
Cantidad: ${quantity.toLocaleString('es-AR')} unidades
Total m2: ${cotizacion.total_m2.toLocaleString('es-AR', { maximumFractionDigits: 1 })}

${mensajeDeImpedimento(imp)}${
      // Si hay una medida de catalogo parecida va con precio: decir que no sin
      // decir que si termina en que alguien tenga que buscarla a mano.
      imp.alternativas.length
        ? '\n\nMedidas de catalogo parecidas:\n' +
          imp.alternativas
            .map(
              (a) =>
                `- ${a.length_mm}x${a.width_mm}x${a.height_mm} mm: ${a.cantidad.toLocaleString('es-AR')} cajas ` +
                `a ${ars(a.precio_por_caja)} c/u, ${ars(a.subtotal)} + IVA`,
            )
            .join('\n') +
          '\n\nEscribi la medida que te sirve y avanzamos.'
        : imp.tipo !== 'no_fabricable' && imp.cajas_necesarias
          ? `\n\nSi te sirven ${imp.cajas_necesarias.toLocaleString('es-AR')} cajas, escribi esa cantidad y te paso el precio.`
          : ''
    }`;
  }

  const caja = cotizacion.boxes[0];

  let message = `COTIZACION QUILMES CORRUGADOS

Caja: ${boxDesc} ${impresion}
Cantidad: ${quantity.toLocaleString('es-AR')} unidades
Total m2: ${cotizacion.total_m2.toLocaleString('es-AR', { maximumFractionDigits: 1 })}

Subtotal: ${ars(cotizacion.subtotal)} + IVA
IVA 21%: ${ars(cotizacion.tax_amount)}
TOTAL: ${ars(cotizacion.total_with_tax)}

Precio unitario: ${precioUnitarioARS(caja.unit_price)} + IVA

${cotizacion.channel_note}
Entrega: ${cotizacion.estimated_days} dias habiles
Cotizacion valida hasta el ${new Date(cotizacion.valid_until + 'T12:00:00').toLocaleDateString('es-AR')}

Ver online: ${SITE_URL}/cotizar/${dimensions.length}x${dimensions.width}x${dimensions.height}/${quantity}`;

  if (colores > 0) {
    message += `

Te mandamos tambien el desplegado de la caja para que incorpores tu diseño. Las areas verdes indican donde cargar el logo.`;
  } else if (!cotizacion.printing.available) {
    message += `

La impresion se produce a medida, desde ${cotizacion.printing.min_m2.toLocaleString('es-AR')} m2. Este pedido sale de stock, asi que va liso.`;
  }

  message += `

Queres confirmar el pedido?

1 - Confirmar (te contacta un vendedor)
2 - Modificar medidas
3 - Hablar con un asesor`;

  return message;
}

/**
 * Lee cual de las opciones numeradas eligio la persona.
 *
 * Antes cada paso hacia bodyLower.includes('2'), que matchea cualquier 2 en
 * cualquier parte del texto. En una prueba real el dueño escribio "2600 no 260"
 * para corregir la cantidad y el bot lo leyo como "opcion 2 = con impresion":
 * la correccion se perdio y encima se agrego un recargo que nadie pidio.
 *
 * Ahora se acepta el numero solo o al principio, o una palabra clave con
 * limite de palabra. Si no hay nada claro devuelve null y quien llama vuelve a
 * preguntar, que es mucho mejor que adivinar.
 */
export function detectarOpcion(
  texto: string,
  opciones: Array<{
    n: number;
    palabras: string[];
    /**
     * Palabras que solo valen si son el mensaje entero. "no" es la respuesta
     * natural a "llevan impresion?", pero tambien aparece en medio de una
     * correccion como "2600 no 260": ahi no elige nada, corrige la cantidad.
     */
    exacto?: string[];
  }>,
): number | null {
  const b = texto.trim().toLowerCase();
  const validos = opciones.map((o) => o.n);

  // "2", "2.", "2)", "2 -"
  const solo = b.match(/^(\d+)\s*[.\-)]?\s*$/);
  if (solo && validos.includes(Number(solo[1]))) return Number(solo[1]);

  // "2 con impresion"
  const prefijo = b.match(/^(\d+)[\s.\-)]+\S/);
  if (prefijo && validos.includes(Number(prefijo[1]))) return Number(prefijo[1]);

  // Palabra clave. Se compara sobre el texto con la puntuacion convertida en
  // espacios y con un espacio en cada punta, asi "sin" nunca matchea dentro de
  // "sinceramente" y no hace falta escapar nada.
  //
  // Se recorren las opciones en orden y gana la primera que aparezca, por eso
  // las mas especificas ("sin impresion") van antes que las generales
  // ("impresion") en la lista que arma quien llama.
  const limpio = b.replace(/[^a-záéíóúüñ0-9]+/gi, ' ').trim();
  const plano = ' ' + limpio + ' ';

  // Primero las que exigen ser el mensaje completo.
  for (const o of opciones) {
    for (const p of o.exacto || []) {
      if (limpio === p.toLowerCase()) return o.n;
    }
  }

  for (const o of opciones) {
    for (const p of o.palabras) {
      if (plano.includes(' ' + p.toLowerCase() + ' ')) return o.n;
    }
  }

  return null;
}

/**
 * Genera mensaje de confirmacion
 */
export function getConfirmationMessage(): string {
  return `Perfecto! Un vendedor te va a contactar en breve para confirmar los detalles.

Horario de atencion: ${HORARIO.corto}

Necesitas algo mas? Escribe "cotizar" para una nueva cotizacion.`;
}

/**
 * Genera mensaje de contacto con asesor
 */
export function getAdvisorMessage(): string {
  return `Te comunicamos con un asesor.

Mientras tanto, podes llamar o escribir a:
WhatsApp: ${CONTACTO.telefonoVisible}
Email: ${CONTACTO.email}

Horario: ${HORARIO.corto}`;
}

/**
 * Genera mensaje sobre envíos
 */
export function getShippingMessage(hasQuoted: boolean = false): string {
  const baseMessage = `Si, hacemos envios a todo el pais!

${ENVIO.largo}`;

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
Nuestro horario es: ${HORARIO.corto}

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
  return transporte.configurado();
}

/**
 * Obtiene el numero de WhatsApp del negocio
 */
export function getBusinessPhone(): string {
  return BUSINESS_PHONE;
}
