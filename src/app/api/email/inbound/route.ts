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
import { getPricePerM2, getProductionDays, getActivePricingConfig } from '@/lib/utils/pricing';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PricingConfig } from '@/lib/types/database';
import { calcularCotizacion, type Impedimento } from '@/lib/cotizacion/motor';

// Cliente Resend para enviar respuestas
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Cotiza contra el motor compartido.
 *
 * Esta era la cuarta copia del calculo en el proyecto, con su propio +15% por
 * impresion cobrado siempre. Ese recargo dejo de ser correcto: a partir del
 * volumen configurado en printing_included_min_m2 la impresion ya viene
 * incluida en el precio por m², asi que aca se estaba cobrando dos veces.
 */
/**
 * Resultado del intento de cotizar por mail.
 *
 * Antes esto era `QuoteData | null` y colapsaba las dos razones por las que
 * un pedido no tiene precio —bajo minimo, medida no fabricable— en el mismo
 * null que devolvia cuando el mail no traia datos parseables. La respuesta
 * automatica entonces caia en la rama "no entendi tus datos" y le pedia al
 * cliente que reenviara las medidas y la cantidad que YA habia mandado. La
 * union discriminada obliga a distinguir "no lo puedo cotizar" de "no
 * entendi el pedido".
 */
type QuoteAttempt =
  | {
      cotizable: true;
      subtotal: number;
      tax_amount: number;
      total_with_tax: number;
      m2_total: number;
      unit_price: number;
      delivery_days: number;
    }
  | { cotizable: false; impedimento: Impedimento };

async function calculateQuote(
  length: number,
  width: number,
  height: number,
  quantity: number,
  hasPrinting: boolean,
  config: PricingConfig,
): Promise<QuoteAttempt> {
  const q = calcularCotizacion(
    [{
      length_mm: length,
      width_mm: width,
      height_mm: height,
      quantity,
      printing_colors: hasPrinting ? 1 : 0,
    }],
    config,
  );

  // Por debajo del minimo, medida propia sin volumen o medida no fabricable:
  // el motor arma el "por que" con `mensajeDeImpedimento` y trae, cuando hay,
  // alternativas de catalogo ya cotizadas. Todo eso viaja hasta el mail para
  // no caer en "no entendi tus datos" cuando en realidad los entendimos.
  if (!q.cotizable) {
    return { cotizable: false, impedimento: q.impedimento };
  }

  return {
    cotizable: true,
    subtotal: Math.round(q.subtotal),
    tax_amount: Math.round(q.tax_amount),
    total_with_tax: Math.round(q.total_with_tax),
    m2_total: q.total_m2,
    unit_price: Math.round(q.boxes[0].unit_price),
    delivery_days: q.estimated_days,
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

    let attempt: QuoteAttempt | null = null;

    // Si tenemos suficientes datos, calcular cotizacion
    if (parsed.dimensions && parsed.quantity) {
      // Obtener configuración de precios activa
      const pricingConfig = await getActivePricingConfig();
      if (pricingConfig) {
        attempt = await calculateQuote(
          parsed.dimensions.length,
          parsed.dimensions.width,
          parsed.dimensions.height,
          parsed.quantity,
          parsed.hasPrinting || false,
          pricingConfig,
        );
      }
    }

    // `quote` cuando hubo precio, `impedimento` cuando el motor entendio el
    // pedido y no lo pudo vender. Se separan a proposito: si se mezclaran en
    // un solo null, la respuesta al mail volveria a caer en la rama "no
    // entendi tus datos" y le pediria al cliente lo que ya mando.
    const quote = attempt && attempt.cotizable ? attempt : null;
    const impedimento =
      attempt && !attempt.cotizable ? attempt.impedimento : undefined;

    // Generar respuesta
    const emailResponse = generateEmailResponse(
      parsed,
      quote || undefined,
      impedimento,
    );

    // Guardar en communications.
    //
    // Webhook publico: lo llama Resend, no un usuario logueado, asi que NO va
    // chequeo de sesion. La tabla `communications` tiene RLS prendido y cero
    // policies: con el cliente de sesion el insert se traga en silencio
    // ("success: true" sin fila nueva), por eso escribimos con la service role.
    const supabase = createAdminClient();
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
        totalArs: quote?.subtotal || 0,
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
