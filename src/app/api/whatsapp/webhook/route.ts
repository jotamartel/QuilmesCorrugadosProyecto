import { NextRequest, NextResponse } from 'next/server';
import {
  sendWhatsAppMessage,
  parseBoxDimensions,
  parseCompanyInfo,
  getConversationState,
  updateConversationState,
  clearConversationState,
  validateDimensions,
  getWelcomeMessage,
  getNameMessage,
  getCompanyInfoMessage,
  getDataConfirmedMessage,
  getQuantityMessage,
  getPrintingMessage,
  getQuoteMessage,
  getConfirmationMessage,
  getAdvisorMessage,
  getShippingMessage,
  getOutOfHoursMessage,
  getUnsupportedMediaMessage,
  isWithinBusinessHours,
  getPhoneQuoteHistory,
  ClientType,
} from '@/lib/whatsapp';
import { sendNotification } from '@/lib/notifications';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, getProductionDays, getActivePricingConfig } from '@/lib/utils/pricing';
import { createClient } from '@/lib/supabase/server';
import { classifyIntent, isGroqEnabled } from '@/lib/groq';
import type { PricingConfig } from '@/lib/types/database';
import {
  upsertContactProfile,
  linkConversationToClient,
} from '@/lib/contact-matching';

const PRINTING_INCREMENT = 0.15; // +15% por cada color de impresión

/**
 * Calcula cotizacion simple para el bot de WhatsApp
 * Usa la configuración de precios activa desde la base de datos
 */
async function calculateQuote(
  length: number,
  width: number,
  height: number,
  quantity: number,
  hasPrinting: boolean,
  config: PricingConfig
): Promise<{ total: number; totalM2: number; deliveryDays: number }> {
  const { m2 } = calculateUnfolded(length, width, height);
  const totalM2 = calculateTotalM2(m2, quantity);

  // Usar la función centralizada para obtener el precio por m²
  const pricePerM2 = getPricePerM2(totalM2, config);

  let total = totalM2 * pricePerM2;

  if (hasPrinting) {
    total *= (1 + PRINTING_INCREMENT);
  }

  const deliveryDays = getProductionDays(hasPrinting, config);

  return {
    total: Math.round(total),
    totalM2,
    deliveryDays,
  };
}

/**
 * Guarda la comunicacion en la base de datos
 */
async function saveCommunication(
  phoneNumber: string,
  direction: 'inbound' | 'outbound',
  content: string,
  metadata?: Record<string, unknown>,
  clientId?: string | null
) {
  try {
    const supabase = await createClient();
    await supabase.from('communications').insert({
      channel: 'whatsapp',
      direction,
      content,
      client_id: clientId || null,
      metadata: {
        phone: phoneNumber,
        ...metadata,
      },
    });
  } catch (error) {
    console.error('[WhatsApp] Error guardando comunicacion:', error);
  }
}

/**
 * Crea un lead en public_quotes desde WhatsApp
 */
async function createWhatsAppLead(data: {
  phoneNumber: string;
  clientName?: string;
  companyName?: string;
  clientEmail?: string;
  clientType?: 'particular' | 'empresa';
  dimensions: { length: number; width: number; height: number };
  quantity: number;
  hasPrinting: boolean;
  quote: { total: number; totalM2: number; deliveryDays: number };
  conversationId?: string;
}): Promise<string | null> {
  try {
    const supabase = await createClient();

    // Calcular m² por caja
    const { m2: sqmPerBox } = calculateUnfolded(
      data.dimensions.length,
      data.dimensions.width,
      data.dimensions.height
    );

    // Insertar lead
    const { data: lead, error } = await supabase
      .from('public_quotes')
      .insert({
        // Datos del solicitante
        requester_name: data.companyName || data.clientName || 'WhatsApp ' + data.phoneNumber.slice(-4),
        requester_company: data.companyName,
        requester_email: data.clientEmail || null,
        requester_phone: data.phoneNumber,
        requester_tax_condition: data.clientType === 'empresa' ? 'responsable_inscripto' : 'consumidor_final',

        // Datos de la caja
        length_mm: data.dimensions.length,
        width_mm: data.dimensions.width,
        height_mm: data.dimensions.height,
        quantity: data.quantity,
        has_printing: data.hasPrinting,
        printing_colors: data.hasPrinting ? 1 : 0,

        // Cálculos
        sqm_per_box: sqmPerBox,
        total_sqm: data.quote.totalM2,
        subtotal: data.quote.total,
        estimated_days: data.quote.deliveryDays,

        // Origen WhatsApp
        source: 'whatsapp',
        source_ip: 'whatsapp:' + data.phoneNumber,
        whatsapp_conversation_id: data.conversationId || null,

        // Estado inicial: lead (no pidió contacto, solo vio precio)
        requested_contact: false,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[WhatsApp] Error creando lead:', error);
      return null;
    }

    console.log('[WhatsApp] Lead creado:', lead.id);
    return lead.id;
  } catch (error) {
    console.error('[WhatsApp] Error creando lead:', error);
    return null;
  }
}

/**
 * Detecta si el mensaje contiene media (audio, imagen, video)
 */
function hasMediaContent(formData: FormData): boolean {
  const mediaFields = ['MediaUrl0', 'MediaContentType0', 'NumMedia'];
  for (const field of mediaFields) {
    const value = formData.get(field);
    if (value && value !== '0') {
      return true;
    }
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = (formData.get('Body') as string || '').trim();
    const phoneNumber = from.replace('whatsapp:', '');
    const bodyLower = body.toLowerCase();

    // Omnicanalidad: upsert contact_profile y matching con client
    const state = await getConversationState(phoneNumber);
    let clientId: string | null = null;
    try {
      const result = await upsertContactProfile({
        phoneNumber,
        email: state.clientEmail,
        displayName: state.clientName,
        companyName: state.companyName,
      });
      clientId = result.clientId;
      await linkConversationToClient(phoneNumber, clientId);
    } catch (err) {
      console.warn('[WhatsApp] Omnicanal: tablas no disponibles o error:', err);
    }

    // Guardar mensaje entrante con client_id si hay match
    await saveCommunication(phoneNumber, 'inbound', body, {
      hasMedia: hasMediaContent(formData),
    }, clientId);
    let responseMessage = '';
    let quoteData: { total: number; totalM2: number } | null = null;
    let needsAdvisor = false;

    // Detectar media (audio/imagen/video)
    if (hasMediaContent(formData)) {
      responseMessage = getUnsupportedMediaMessage();
    }
    // Continuar con el flujo normal si no hay media
    else {
      // Patrones de mensajes de cierre
      const closingPatterns = [
        'gracias', 'gracia', 'muchas gracias', 'mil gracias',
        'ok', 'okay', 'okey', 'dale', 'buenisimo', 'buenísimo',
        'perfecto', 'excelente', 'genial', 'barbaro', 'bárbaro',
        'listo', 'entendido', 'recibido', 'anotado',
        'nos vemos', 'hasta luego', 'chau', 'adios', 'adiós',
        'buen dia', 'buen día', 'saludos',
      ];
      const isClosingMessage = closingPatterns.some(pattern =>
        bodyLower === pattern || bodyLower.startsWith(pattern + ' ') || bodyLower.endsWith(' ' + pattern)
      );

      // Comandos especiales
      if (bodyLower === 'cancelar' || bodyLower === 'reiniciar') {
        await clearConversationState(phoneNumber);
        responseMessage = 'Conversacion reiniciada. Escribe "cotizar" para empezar de nuevo.';
      }
      // Mensajes de cierre
      else if (isClosingMessage) {
        responseMessage = `Gracias a vos! Si necesitas otra cotizacion, escribi "cotizar".

Quilmes Corrugados - Lunes a Viernes 7:00 - 16:00`;
      }
      // Esperando tipo de cliente (particular o empresa)
      else if (state.step === 'waiting_client_type') {
        let isParticular = bodyLower.includes('1') ||
          bodyLower.includes('particular') ||
          bodyLower.includes('persona') ||
          bodyLower.includes('yo');

        let isEmpresa = bodyLower.includes('2') ||
          bodyLower.includes('empresa') ||
          bodyLower.includes('negocio') ||
          bodyLower.includes('compañia') ||
          bodyLower.includes('pyme');

        // Si no detectamos con patterns simples, usar Groq
        if (!isParticular && !isEmpresa && isGroqEnabled()) {
          try {
            const classification = await classifyIntent(body, state.step);
            if (classification.intent === 'client_particular') {
              isParticular = true;
            } else if (classification.intent === 'client_empresa') {
              isEmpresa = true;
            }
          } catch (error) {
            console.error('[WhatsApp] Error con Groq en waiting_client_type:', error);
          }
        }

        if (isParticular) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_name',
            clientType: 'particular' as ClientType,
          });
          responseMessage = getNameMessage();
        } else if (isEmpresa) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_company_info',
            clientType: 'empresa' as ClientType,
          });
          responseMessage = getCompanyInfoMessage();
        } else {
          responseMessage = `No entendi tu respuesta. Por favor elegi:

1 - Particular
2 - Empresa`;
        }
      }
      // Esperando nombre (para particulares)
      else if (state.step === 'waiting_name') {
        // Validar que el mensaje parece un nombre (al menos 2 palabras o más de 3 caracteres)
        const name = body.trim();
        if (name.length >= 3) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_dimensions',
            clientName: name,
          });
          responseMessage = getDataConfirmedMessage('particular', name);
        } else {
          responseMessage = `Por favor, indicame tu nombre completo.`;
        }
      }
      // Esperando datos de empresa
      else if (state.step === 'waiting_company_info') {
        const parsed = parseCompanyInfo(body);

        // Acumular datos parciales del estado actual
        const currentCompany = state.companyName || parsed.companyName;
        const currentName = state.clientName || parsed.contactName;
        const currentEmail = state.clientEmail || parsed.email;

        // Si tenemos todos los datos, pasar a dimensiones
        if (currentCompany && currentName && currentEmail) {
          await updateConversationState(phoneNumber, {
            step: 'waiting_dimensions',
            companyName: currentCompany,
            clientName: currentName,
            clientEmail: currentEmail,
          });
          responseMessage = getDataConfirmedMessage('empresa', currentName, currentCompany);
        }
        // Si tenemos datos parciales, guardarlos y pedir lo que falta
        else if (parsed.companyName || parsed.contactName || parsed.email) {
          await updateConversationState(phoneNumber, {
            companyName: currentCompany,
            clientName: currentName,
            clientEmail: currentEmail,
          });

          const missing: string[] = [];
          if (!currentCompany) missing.push('nombre de la empresa');
          if (!currentName) missing.push('tu nombre de contacto');
          if (!currentEmail) missing.push('email de contacto');

          responseMessage = `Gracias! Todavia me falta: ${missing.join(', ')}.`;
        }
        // Si no pudimos parsear nada
        else {
          responseMessage = `No pude entender los datos. Por favor enviame:

- Nombre de la empresa
- Tu nombre de contacto
- Email de contacto

Ejemplo:
Acme SRL
Juan Perez
juan@acme.com`;
        }
      }
      // Esperando dimensiones
      else if (state.step === 'waiting_dimensions') {
        const parsed = parseBoxDimensions(body);

        if (parsed?.length && parsed?.width && parsed?.height) {
          const validation = validateDimensions(parsed.length, parsed.width, parsed.height);

          if (!validation.valid) {
            responseMessage = validation.error!;
          } else {
            await updateConversationState(phoneNumber, {
              step: 'waiting_quantity',
              dimensions: { length: parsed.length, width: parsed.width, height: parsed.height },
            });
            responseMessage = getQuantityMessage(parsed.length, parsed.width, parsed.height);
          }
        } else {
          responseMessage = `No pude entender las medidas.

Por favor usa el formato:
- 400x300x300
- 40x30x30 cm
- Largo 400 Ancho 300 Alto 300`;
        }
      }
      // Esperando cantidad
      else if (state.step === 'waiting_quantity') {
        const qtyMatch = body.match(/(\d{1,3}(?:\.\d{3})*|\d+)/);

        if (qtyMatch) {
          const quantity = Number(qtyMatch[1].replace(/\./g, ''));

          if (quantity < 100) {
            responseMessage = `La cantidad minima es 100 unidades. Cuantas necesitas?`;
          } else {
            await updateConversationState(phoneNumber, {
              step: 'waiting_printing',
              quantity,
            });
            responseMessage = getPrintingMessage(quantity);
          }
        } else {
          responseMessage = `No entendi la cantidad. Por favor escribe solo el numero.

Ejemplo: 500`;
        }
      }
      // Esperando impresion
      else if (state.step === 'waiting_printing') {
        const hasPrinting = bodyLower.includes('2') ||
          bodyLower.includes('impresion') ||
          bodyLower.includes('impreso') ||
          bodyLower.includes('si') ||
          bodyLower.includes('logo');

        const { dimensions, quantity } = state;

        if (!dimensions || !quantity) {
          await clearConversationState(phoneNumber);
          responseMessage = 'Hubo un error. Escribe "cotizar" para empezar de nuevo.';
        } else {
          // Obtener configuración de precios activa
          const pricingConfig = await getActivePricingConfig();
          if (!pricingConfig) {
            responseMessage = 'Disculpá, hay un problema técnico con los precios. Por favor contactá con un asesor.';
          } else {
            const quote = await calculateQuote(
              dimensions.length,
              dimensions.width,
              dimensions.height,
              quantity,
              hasPrinting,
              pricingConfig
            );

            await updateConversationState(phoneNumber, {
              step: 'quoted',
              hasPrinting,
              lastQuoteTotal: quote.total,
              lastQuoteM2: quote.totalM2,
            });

            responseMessage = getQuoteMessage(dimensions, quantity, hasPrinting, quote);
            quoteData = { total: quote.total, totalM2: quote.totalM2 };

            // Crear lead en public_quotes
            await createWhatsAppLead({
              phoneNumber,
              clientName: state.clientName,
              companyName: state.companyName,
              clientEmail: state.clientEmail,
              clientType: state.clientType,
              dimensions,
              quantity,
              hasPrinting,
              quote,
            });

            // Notificar al equipo con datos del cliente
            await sendNotification({
              type: 'lead_with_contact',
              origin: 'WhatsApp',
              box: dimensions,
              quantity,
              totalArs: quote.total,
              contact: {
                phone: phoneNumber,
                name: state.clientName,
                email: state.clientEmail,
                company: state.companyName,
              },
            });
          }
        }
      }
      // Ya cotizado, esperando confirmacion
      else if (state.step === 'quoted') {
        if (bodyLower.includes('1') || bodyLower.includes('confirmar') || bodyLower.includes('si')) {
          responseMessage = getConfirmationMessage();
          await clearConversationState(phoneNumber);
        } else if (bodyLower.includes('2') || bodyLower.includes('modificar')) {
          await updateConversationState(phoneNumber, { step: 'waiting_dimensions' });
          responseMessage = `OK, empecemos de nuevo. Indicame las nuevas medidas:

Formato: Largo x Ancho x Alto
Ejemplo: 400x300x300`;
        } else if (bodyLower.includes('3') || bodyLower.includes('asesor')) {
          responseMessage = getAdvisorMessage();
          needsAdvisor = true;

          // Notificar al equipo que piden asesor con datos del cliente
          await sendNotification({
            type: 'advisor_request',
            origin: 'WhatsApp',
            contact: {
              phone: phoneNumber,
              name: state.clientName,
              email: state.clientEmail,
            },
          });
        } else {
          responseMessage = `No entendi tu respuesta. Por favor elegi una opcion:

1 - Confirmar pedido
2 - Modificar medidas
3 - Hablar con un asesor`;
        }
      }
      // Inicio de conversacion
      else if (
        state.step === 'initial' ||
        bodyLower.includes('hola') ||
        bodyLower.includes('cotizar') ||
        bodyLower.includes('buenos dias') ||
        bodyLower.includes('buenas tardes')
      ) {
        // Verificar si es cliente repetido
        const history = await getPhoneQuoteHistory(phoneNumber);
        const isReturning = history.totalQuotes > 0;

        // Ahora va a waiting_client_type para pedir datos primero
        await updateConversationState(phoneNumber, { step: 'waiting_client_type' });

        // Mensaje de bienvenida que pregunta si es particular o empresa
        responseMessage = getWelcomeMessage(isReturning, history.lastQuote);

        // Si es fuera de horario y es primer mensaje, agregar aviso
        if (!isWithinBusinessHours() && state.step === 'initial') {
          responseMessage = getOutOfHoursMessage() + '\n\n---\n\n' + responseMessage;
        }
      }
      // Estado desconocido - usar Groq
      else {
        if (isGroqEnabled()) {
          try {
            const classification = await classifyIntent(body, state.step);
            console.log('[WhatsApp] Groq classification:', classification);

            switch (classification.intent) {
              case 'greeting':
              case 'quote_request': {
                const history = await getPhoneQuoteHistory(phoneNumber);
                await updateConversationState(phoneNumber, { step: 'waiting_client_type' });
                responseMessage = getWelcomeMessage(history.totalQuotes > 0, history.lastQuote);
                break;
              }

              case 'closing':
                responseMessage = `Gracias a vos! Si necesitas otra cotizacion, escribi "cotizar".

Quilmes Corrugados - Lunes a Viernes 7:00 - 16:00`;
                break;

              case 'advisor':
              case 'question_other':
                responseMessage = getAdvisorMessage();
                needsAdvisor = true;

                // Notificar al equipo con datos del cliente
                await sendNotification({
                  type: 'advisor_request',
                  origin: 'WhatsApp',
                  contact: {
                    phone: phoneNumber,
                    name: state.clientName,
                    email: state.clientEmail,
                  },
                });
                break;

              case 'question_shipping':
                responseMessage = getShippingMessage(state.step === 'quoted');
                break;

              default:
                responseMessage = `No entendi tu mensaje.

Escribe "cotizar" para una cotizacion o "asesor" para hablar con alguien.`;
            }
          } catch (error) {
            console.error('[WhatsApp] Error con Groq:', error);
            responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
          }
        } else {
          responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
        }
      }
    }

    // Preparar metadata
    const outboundMetadata: Record<string, unknown> = { state: state.step };

    if (quoteData) {
      outboundMetadata.quote = quoteData;
    }

    if (needsAdvisor) {
      outboundMetadata.needsAdvisor = true;
    }

    // Enviar respuesta
    await sendWhatsAppMessage({ to: from, body: responseMessage });

    // Guardar mensaje saliente con client_id
    await saveCommunication(phoneNumber, 'outbound', responseMessage, outboundMetadata, clientId);

    // TwiML vacío
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );

  } catch (error) {
    console.error('[WhatsApp] Webhook error:', error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'WhatsApp webhook',
    timestamp: new Date().toISOString(),
    businessHours: isWithinBusinessHours(),
  });
}
