/**
 * API Dashboard: /api/public-quotes
 * Listar cotizaciones públicas (requiere autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros de filtrado
    const status = searchParams.get('status');
    const requestedContact = searchParams.get('requested_contact');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir query
    let query = supabase
      .from('public_quotes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtrar por status si se especifica
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Filtrar por requested_contact si se especifica
    // Nota: Los "converted" siempre se consideran cotizaciones web (requested_contact = true)
    if (requestedContact !== null && requestedContact !== undefined) {
      if (requestedContact === 'true') {
        // Cotizaciones Web: requested_contact = true O status = converted
        query = query.or('requested_contact.eq.true,status.eq.converted');
      } else {
        // Leads Web: requested_contact = false Y status != converted
        query = query.eq('requested_contact', false).neq('status', 'converted');
      }
    }

    // Filtrar por fecha desde
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }

    // Filtrar por fecha hasta
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data: quotes, error, count } = await query;

    if (error) {
      console.error('Error fetching public quotes:', error);
      return NextResponse.json(
        { error: 'Error al obtener cotizaciones' },
        { status: 500 }
      );
    }

    // Formatear números de cotización
    const formattedQuotes = (quotes || []).map(quote => ({
      ...quote,
      quote_number_formatted: `QW-${String(quote.quote_number).padStart(4, '0')}`,
    }));

    // Obtener conteos por status y requested_contact
    const { data: allQuotes } = await supabase
      .from('public_quotes')
      .select('status, requested_contact');

    const counts = {
      pending: 0,
      contacted: 0,
      converted: 0,
      rejected: 0,
      total: 0,
      leads: 0, // requested_contact = false
      quotes: 0, // requested_contact = true
    };

    // Conteos filtrados por requested_contact (para mostrar en los tabs)
    const filteredCounts = {
      pending: 0,
      contacted: 0,
      converted: 0,
      rejected: 0,
      total: 0,
    };

    (allQuotes || []).forEach(q => {
      const status = q.status as keyof typeof counts;

      // Determinar si es cotización web (requested_contact = true O status = converted)
      const isQuote = q.requested_contact === true || q.status === 'converted';

      // Conteos globales
      if (status in counts && status !== 'total' && status !== 'leads' && status !== 'quotes') {
        counts[status]++;
      }
      counts.total++;
      if (isQuote) {
        counts.quotes++;
      } else {
        counts.leads++;
      }

      // Conteos filtrados por requested_contact
      let matchesFilter = true;
      if (requestedContact !== null && requestedContact !== undefined) {
        if (requestedContact === 'true') {
          // Cotizaciones Web: requested_contact = true O status = converted
          matchesFilter = isQuote;
        } else {
          // Leads Web: requested_contact = false Y status != converted
          matchesFilter = !isQuote;
        }
      }

      if (matchesFilter) {
        if (status in filteredCounts && status !== 'total') {
          (filteredCounts as Record<string, number>)[status]++;
        }
        filteredCounts.total++;
      }
    });

    // Combinar: usar filteredCounts para los tabs, pero mantener leads/quotes globales
    const finalCounts = {
      ...filteredCounts,
      leads: counts.leads,
      quotes: counts.quotes,
    };

    return NextResponse.json({
      quotes: formattedQuotes,
      total: count || 0,
      counts: finalCounts,
    });

  } catch (error) {
    console.error('Error in GET /api/public-quotes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
