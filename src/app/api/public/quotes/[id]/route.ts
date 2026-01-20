/**
 * API Pública: /api/public/quotes/[id]
 * Ver cotización pública por ID (datos limitados, sin info sensible)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: quote, error } = await supabase
      .from('public_quotes')
      .select(`
        id,
        quote_number,
        requester_name,
        requester_company,
        requester_email,
        requester_phone,
        length_mm,
        width_mm,
        height_mm,
        quantity,
        has_printing,
        printing_colors,
        design_file_name,
        sheet_width_mm,
        sheet_length_mm,
        sqm_per_box,
        total_sqm,
        unit_price,
        subtotal,
        estimated_days,
        status,
        created_at
      `)
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
    console.error('Error in GET /api/public/quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
