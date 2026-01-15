/**
 * API: POST /api/quotes/[id]/send
 * Marca una cotización como enviada y registra la comunicación
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = createAdminClient();

    // Verificar que la cotización existe
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, status, client_id, quote_number')
      .eq('id', id)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que está en estado válido para enviar
    if (quote.status !== 'draft' && quote.status !== 'sent') {
      return NextResponse.json(
        { error: `No se puede enviar una cotización en estado "${quote.status}"` },
        { status: 400 }
      );
    }

    // Actualizar estado
    const { data: updatedQuote, error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Registrar comunicación
    const channel = body.channel || 'manual';
    const content = body.content || `Cotización ${quote.quote_number} enviada`;

    await supabase.from('communications').insert({
      client_id: quote.client_id,
      quote_id: quote.id,
      channel,
      direction: 'outbound',
      subject: 'Cotización enviada',
      content,
      metadata: {
        quote_number: quote.quote_number,
        sent_via: channel,
      },
    });

    return NextResponse.json({
      success: true,
      quote: updatedQuote,
      message: `Cotización ${quote.quote_number} marcada como enviada`,
    });
  } catch (error) {
    console.error('Error in POST /api/quotes/[id]/send:', error);
    return NextResponse.json(
      { error: 'Error al enviar la cotización' },
      { status: 500 }
    );
  }
}
