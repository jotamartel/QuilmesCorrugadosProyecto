/**
 * API Dashboard: /api/public-quotes/[id]
 * Ver y actualizar cotización pública (requiere autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UpdatePublicQuoteRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: quote, error } = await supabase
      .from('public_quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !quote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Formatear número de cotización
    const formattedQuote = {
      ...quote,
      quote_number_formatted: `QW-${String(quote.quote_number).padStart(4, '0')}`,
    };

    return NextResponse.json(formattedQuote);

  } catch (error) {
    console.error('Error in GET /api/public-quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body: UpdatePublicQuoteRequest = await request.json();

    // Solo permitir actualizar status y notes
    const allowedFields = ['status', 'notes'];
    const updateData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos válidos para actualizar' },
        { status: 400 }
      );
    }

    // Si el status cambia a 'converted', marcar como cotización web (requested_contact = true)
    // Esto hace que los leads convertidos aparezcan en "Cotizaciones Web" en lugar de "Leads Web"
    if (updateData.status === 'converted') {
      updateData.requested_contact = true;
    }

    const { data: quote, error } = await supabase
      .from('public_quotes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating public quote:', error);
      return NextResponse.json(
        { error: 'Error al actualizar la cotización' },
        { status: 500 }
      );
    }

    return NextResponse.json(quote);

  } catch (error) {
    console.error('Error in PATCH /api/public-quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
