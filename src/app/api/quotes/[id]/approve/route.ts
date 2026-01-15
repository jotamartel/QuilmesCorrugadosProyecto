/**
 * API: POST /api/quotes/[id]/approve
 * Aprueba una cotización
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
      .select('id, status, client_id, quote_number, valid_until')
      .eq('id', id)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que está en estado válido para aprobar
    if (quote.status !== 'sent' && quote.status !== 'draft') {
      return NextResponse.json(
        { error: `No se puede aprobar una cotización en estado "${quote.status}"` },
        { status: 400 }
      );
    }

    // Verificar que no está expirada
    const validUntil = new Date(quote.valid_until);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (validUntil < today) {
      // Marcar como expirada
      await supabase
        .from('quotes')
        .update({
          status: 'expired',
          expired_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json(
        { error: 'La cotización ha expirado y no puede ser aprobada' },
        { status: 400 }
      );
    }

    // Actualizar estado
    const { data: updatedQuote, error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, company),
        items:quote_items(*)
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    // Registrar comunicación si se especifica
    if (body.register_communication !== false) {
      await supabase.from('communications').insert({
        client_id: quote.client_id,
        quote_id: quote.id,
        channel: body.channel || 'manual',
        direction: 'inbound',
        subject: 'Cotización aprobada',
        content: body.notes || `Cliente aprobó cotización ${quote.quote_number}`,
        metadata: {
          quote_number: quote.quote_number,
        },
      });
    }

    return NextResponse.json({
      success: true,
      quote: updatedQuote,
      message: `Cotización ${quote.quote_number} aprobada`,
    });
  } catch (error) {
    console.error('Error in POST /api/quotes/[id]/approve:', error);
    return NextResponse.json(
      { error: 'Error al aprobar la cotización' },
      { status: 500 }
    );
  }
}
