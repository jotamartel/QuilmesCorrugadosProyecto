/**
 * Webhook: /api/webhooks/mercadopago
 * Recibe notificaciones de MercadoPago cuando un pago cambia de estado.
 * Actualiza el estado de la cotización en Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { createAdminClient } from '@/lib/supabase/admin';

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // MercadoPago sends different notification types
    // We only care about payment notifications
    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    if (!MP_ACCESS_TOKEN || MP_ACCESS_TOKEN.includes('0000000000')) {
      console.warn('MercadoPago webhook: ACCESS_TOKEN not configured');
      return NextResponse.json({ received: true });
    }

    // Fetch payment details from MercadoPago
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    const paymentData = await payment.get({ id: paymentId });

    if (!paymentData) {
      console.error('Could not fetch payment:', paymentId);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const quoteId = paymentData.external_reference;
    const status = paymentData.status; // approved, pending, rejected, etc.

    if (!quoteId) {
      console.warn('Payment without external_reference:', paymentId);
      return NextResponse.json({ received: true });
    }

    // Map MercadoPago status to our quote status
    const quoteStatus = status === 'approved'
      ? 'approved'
      : status === 'rejected' || status === 'cancelled' || status === 'refunded'
        ? 'rejected'
        : 'pending'; // pending, in_process, etc.

    // Map to fulfillment status
    const fulfillmentStatus = status === 'approved'
      ? 'paid'
      : status === 'rejected' || status === 'cancelled' || status === 'refunded'
        ? 'pending_payment'
        : 'pending_payment';

    // Update quote in Supabase
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('public_quotes')
      .update({
        status: quoteStatus,
        fulfillment_status: fulfillmentStatus,
        // Store payment info in message (append)
        message: undefined, // We'll use a raw query instead
      })
      .eq('id', quoteId);

    if (error) {
      console.error('Error updating quote:', error);
    }

    // Append payment info to the message
    const paymentInfo = `\n\n[MercadoPago] Pago ${status} — ID: ${paymentId} — Monto: $${paymentData.transaction_amount?.toLocaleString('es-AR')}`;
    await supabase.rpc('append_to_message', {
      quote_id: quoteId,
      extra_text: paymentInfo,
    }).then(({ error: rpcError }) => {
      // If RPC doesn't exist, just update status (no big deal)
      if (rpcError) {
        console.warn('RPC append_to_message not found, updating status only');
      }
    });

    console.log(`Payment ${paymentId} for quote ${quoteId}: ${status}`);

    return NextResponse.json({ received: true, status: quoteStatus });

  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to MercadoPago to prevent retries
    return NextResponse.json({ received: true });
  }
}

// MercadoPago also sends GET to verify the webhook endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
