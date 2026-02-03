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
    const source = searchParams.get('source'); // 'web' | 'whatsapp' | null (todos)
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

    // Filtrar por source (origen: web o whatsapp)
    if (source && source !== 'all') {
      query = query.eq('source', source);
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

    // Obtener conteos por status, requested_contact y source
    const { data: allQuotes } = await supabase
      .from('public_quotes')
      .select('status, requested_contact, source');

    const counts = {
      pending: 0,
      contacted: 0,
      converted: 0,
      rejected: 0,
      total: 0,
      leads: 0, // requested_contact = false
      quotes: 0, // requested_contact = true
      // Por source
      web: 0,
      whatsapp: 0,
      // WhatsApp específicos
      whatsapp_pending: 0,
      whatsapp_contacted: 0,
      whatsapp_converted: 0,
      whatsapp_total: 0,
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
      const qStatus = q.status as string;
      const qSource = (q.source || 'web') as string;

      // Determinar si es cotización web (requested_contact = true O status = converted)
      const isQuote = q.requested_contact === true || q.status === 'converted';

      // Conteos globales por status
      if (['pending', 'contacted', 'converted', 'rejected'].includes(qStatus)) {
        (counts as Record<string, number>)[qStatus]++;
      }
      counts.total++;

      // Conteos por tipo (lead vs cotización)
      if (isQuote) {
        counts.quotes++;
      } else {
        counts.leads++;
      }

      // Conteos por source
      if (qSource === 'whatsapp') {
        counts.whatsapp++;
        counts.whatsapp_total++;
        if (qStatus === 'pending') counts.whatsapp_pending++;
        if (qStatus === 'contacted') counts.whatsapp_contacted++;
        if (qStatus === 'converted') counts.whatsapp_converted++;
      } else {
        counts.web++;
      }

      // Conteos filtrados por requested_contact y source
      let matchesFilter = true;
      if (requestedContact !== null && requestedContact !== undefined) {
        if (requestedContact === 'true') {
          matchesFilter = isQuote;
        } else {
          matchesFilter = !isQuote;
        }
      }
      if (source && source !== 'all') {
        matchesFilter = matchesFilter && qSource === source;
      }

      if (matchesFilter) {
        if (['pending', 'contacted', 'converted', 'rejected'].includes(qStatus)) {
          (filteredCounts as Record<string, number>)[qStatus]++;
        }
        filteredCounts.total++;
      }
    });

    // Combinar: usar filteredCounts para los tabs, pero mantener conteos globales
    const finalCounts = {
      ...filteredCounts,
      leads: counts.leads,
      quotes: counts.quotes,
      web: counts.web,
      whatsapp: counts.whatsapp,
      whatsapp_pending: counts.whatsapp_pending,
      whatsapp_contacted: counts.whatsapp_contacted,
      whatsapp_converted: counts.whatsapp_converted,
      whatsapp_total: counts.whatsapp_total,
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
