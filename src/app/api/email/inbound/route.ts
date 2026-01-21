import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  parseEmailForQuote,
  generateEmailResponse,
  extractEmailAddress,
  extractNameFromFrom,
} from '@/lib/email-parser';
import { sendNotification } from '@/lib/notifications';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { createClient } from '@/lib/supabase/server';

// Cliente Resend para enviar respuestas
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Precios hardcodeados (consistente con el sistema)
const PRICING = {
  standardPricePerM2: 700,
  volumePricePerM2: 670,
  volumeThreshold: 5000,
  printingIncrement: 0.15,
};

const PRODUCTION_DAYS = {
  standard: 7,
  withPrinting: 14,
};

/**
 * Calcula cotizacion
 */
function calculateQuote(
  length: number,
  width: number,
  height: number,
  quantity: number,
  hasPrinting: boolean
): { total: number; m2_total: number; unit_price: number; delivery_days: number } {
  const { m2 } = calculateUnfolded(length, width, height);
  const m2_total = calculateTotalM2(m2, quantity);

  const pricePerM2 = m2_total >= PRICING.volumeThreshold
    ? PRICING.volumePricePerM2
    : PRICING.standardPricePerM2;

  let total = m2_total * pricePerM2;

  if (hasPrinting) {
    total *= (1 + PRICING.printingIncrement);
  }

  total = Math.round(total);

  return {
    total,
    m2_total,
    unit_price: Math.round(total / quantity),
    delivery_days: hasPrinting ? PRODUCTION_DAYS.withPrinting : PRODUCTION_DAYS.standard,
  };
}

/**
 * Webhook para recibir emails entrantes de Resend
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Resend envia: from, to, subject, text, html
    const { from, subject, text, html } = body;

    if (!from) {
      return NextResponse.json({ error: 'Missing from field' }, { status: 400 });
    }

    // Extraer email y nombre del remitente
    const fromEmail = extractEmailAddress(from);
    const fromName = extractNameFromFrom(from);

    console.log('[Email Inbound] Recibido de:', fromEmail, 'Asunto:', subject);

    // Parsear el contenido
    const parsed = parseEmailForQuote(subject || '', text || html || '');

    // Si encontramos nombre en el From, usarlo
    if (fromName && !parsed.clientName) {
      parsed.clientName = fromName;
    }

    let quote = null;

    // Si tenemos suficientes datos, calcular cotizacion
    if (parsed.dimensions && parsed.quantity) {
      quote = calculateQuote(
        parsed.dimensions.length,
        parsed.dimensions.width,
        parsed.dimensions.height,
        parsed.quantity,
        parsed.hasPrinting || false
      );
    }

    // Generar respuesta
    const emailResponse = generateEmailResponse(parsed, quote || undefined);

    // Guardar en communications
    const supabase = await createClient();
    await supabase.from('communications').insert({
      channel: 'email',
      direction: 'inbound',
      subject: subject || null,
      content: text || html,
      metadata: {
        from: fromEmail,
        from_name: fromName,
        parsed,
        quote,
        auto_replied: !!resend,
      },
    });

    // Enviar respuesta automatica si Resend esta configurado
    if (resend) {
      const fromAddress = process.env.FROM_EMAIL || 'cotizaciones@quilmescorrugados.com.ar';

      const { error } = await resend.emails.send({
        from: `Quilmes Corrugados <${fromAddress}>`,
        to: fromEmail,
        subject: emailResponse.subject,
        text: emailResponse.body,
        replyTo: 'ventas@quilmescorrugados.com.ar',
      });

      if (error) {
        console.error('[Email Inbound] Error enviando respuesta:', error);
      } else {
        console.log('[Email Inbound] Respuesta enviada a:', fromEmail);

        // Guardar respuesta enviada
        await supabase.from('communications').insert({
          channel: 'email',
          direction: 'outbound',
          subject: emailResponse.subject,
          content: emailResponse.body,
          metadata: {
            to: fromEmail,
            auto_generated: true,
          },
        });
      }
    }

    // Notificar al equipo si hay datos de contacto o cotizacion
    if (quote || parsed.clientPhone) {
      await sendNotification({
        type: 'lead_with_contact',
        origin: 'Email',
        box: parsed.dimensions || { length: 0, width: 0, height: 0 },
        quantity: parsed.quantity || 0,
        totalArs: quote?.total || 0,
        contact: {
          name: parsed.clientName,
          company: parsed.clientCompany,
          email: fromEmail,
          phone: parsed.clientPhone,
        },
      });
    }

    return NextResponse.json({
      success: true,
      parsed,
      quote,
      auto_replied: !!resend,
    });

  } catch (error) {
    console.error('[Email Inbound] Error:', error);
    return NextResponse.json(
      { error: 'Error processing email' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Email inbound webhook',
    resend_configured: !!resend,
    timestamp: new Date().toISOString(),
  });
}
