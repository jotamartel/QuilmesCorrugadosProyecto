import { NextRequest, NextResponse } from 'next/server';
import {
  sendWhatsAppMessage,
  parseBoxDimensions,
  getConversationState,
  updateConversationState,
  clearConversationState,
  validateDimensions,
  getWelcomeMessage,
  getQuantityMessage,
  getPrintingMessage,
  getQuoteMessage,
  getConfirmationMessage,
  getAdvisorMessage,
} from '@/lib/whatsapp';
import { sendNotification } from '@/lib/notifications';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { createClient } from '@/lib/supabase/server';

// Precios hardcodeados para el bot (consistente con el sistema)
const PRICING = {
  standardPricePerM2: 700,
  volumePricePerM2: 670,
  volumeThreshold: 5000,
  printingIncrement: 0.15, // 15% por impresion
};

const PRODUCTION_DAYS = {
  standard: 7,
  withPrinting: 14,
};

/**
 * Calcula cotizacion simple para el bot de WhatsApp
 */
function calculateQuote(
  length: number,
  width: number,
  height: number,
  quantity: number,
  hasPrinting: boolean
): { total: number; totalM2: number; deliveryDays: number } {
  const { m2 } = calculateUnfolded(length, width, height);
  const totalM2 = calculateTotalM2(m2, quantity);

  // Precio base segun volumen
  const pricePerM2 = totalM2 >= PRICING.volumeThreshold
    ? PRICING.volumePricePerM2
    : PRICING.standardPricePerM2;

  let total = totalM2 * pricePerM2;

  // Incremento por impresion
  if (hasPrinting) {
    total *= (1 + PRICING.printingIncrement);
  }

  const deliveryDays = hasPrinting ? PRODUCTION_DAYS.withPrinting : PRODUCTION_DAYS.standard;

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
  metadata?: Record<string, unknown>
) {
  try {
    const supabase = await createClient();
    await supabase.from('communications').insert({
      channel: 'whatsapp',
      direction,
      content,
      metadata: {
        phone: phoneNumber,
        ...metadata,
      },
    });
  } catch (error) {
    console.error('[WhatsApp] Error guardando comunicacion:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string; // whatsapp:+5491155551234
    const body = (formData.get('Body') as string || '').trim();
    const phoneNumber = from.replace('whatsapp:', '');
    const bodyLower = body.toLowerCase();

    // Guardar mensaje entrante
    await saveCommunication(phoneNumber, 'inbound', body);

    const state = getConversationState(phoneNumber);
    let responseMessage = '';

    // Comandos especiales
    if (bodyLower === 'cancelar' || bodyLower === 'reiniciar') {
      clearConversationState(phoneNumber);
      responseMessage = 'Conversacion reiniciada. Escribe "cotizar" para empezar de nuevo.';
    }
    // Inicio de conversacion
    else if (
      state.step === 'initial' ||
      bodyLower.includes('hola') ||
      bodyLower.includes('cotizar') ||
      bodyLower.includes('buenos dias') ||
      bodyLower.includes('buenas tardes')
    ) {
      updateConversationState(phoneNumber, { step: 'waiting_dimensions' });
      responseMessage = getWelcomeMessage();
    }
    // Esperando dimensiones
    else if (state.step === 'waiting_dimensions') {
      const parsed = parseBoxDimensions(body);

      if (parsed?.length && parsed?.width && parsed?.height) {
        const validation = validateDimensions(parsed.length, parsed.width, parsed.height);

        if (!validation.valid) {
          responseMessage = validation.error!;
        } else {
          updateConversationState(phoneNumber, {
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
      const qtyMatch = body.match(/\d+/);

      if (qtyMatch) {
        const quantity = Number(qtyMatch[0]);

        if (quantity < 100) {
          responseMessage = `La cantidad minima es 100 unidades. Cuantas necesitas?`;
        } else {
          updateConversationState(phoneNumber, {
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
        clearConversationState(phoneNumber);
        responseMessage = 'Hubo un error. Escribe "cotizar" para empezar de nuevo.';
      } else {
        updateConversationState(phoneNumber, {
          step: 'quoted',
          hasPrinting,
        });

        const quote = calculateQuote(
          dimensions.length,
          dimensions.width,
          dimensions.height,
          quantity,
          hasPrinting
        );

        responseMessage = getQuoteMessage(dimensions, quantity, hasPrinting, quote);

        // Notificar al equipo
        await sendNotification({
          type: 'lead_with_contact',
          origin: 'WhatsApp',
          box: dimensions,
          quantity,
          totalArs: quote.total,
          contact: { phone: phoneNumber },
        });
      }
    }
    // Ya cotizado, esperando confirmacion
    else if (state.step === 'quoted') {
      if (bodyLower.includes('1') || bodyLower.includes('confirmar') || bodyLower.includes('si')) {
        responseMessage = getConfirmationMessage();
        clearConversationState(phoneNumber);
      } else if (bodyLower.includes('2') || bodyLower.includes('modificar')) {
        updateConversationState(phoneNumber, { step: 'waiting_dimensions' });
        responseMessage = `OK, empecemos de nuevo. Indicame las nuevas medidas:

Formato: Largo x Ancho x Alto
Ejemplo: 400x300x300`;
      } else if (bodyLower.includes('3') || bodyLower.includes('asesor')) {
        responseMessage = getAdvisorMessage();
      } else {
        responseMessage = `No entendi tu respuesta. Por favor elegi una opcion:

1 - Confirmar pedido
2 - Modificar medidas
3 - Hablar con un asesor`;
      }
    }
    // Estado desconocido
    else {
      clearConversationState(phoneNumber);
      responseMessage = 'Escribe "cotizar" para empezar una nueva cotizacion.';
    }

    // Enviar respuesta
    await sendWhatsAppMessage({ to: from, body: responseMessage });

    // Guardar mensaje saliente
    await saveCommunication(phoneNumber, 'outbound', responseMessage, { state: state.step });

    // Twilio espera un TwiML vacio
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

// Verificacion de Twilio (GET para health check)
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'WhatsApp webhook',
    timestamp: new Date().toISOString(),
  });
}
