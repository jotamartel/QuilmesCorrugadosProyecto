/**
 * API: /api/retail-sales
 * GET - Lista pedidos retail con filtros y conteo por fulfillment_status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FulfillmentStatus } from '@/lib/types/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parametros de filtro
    const fulfillmentStatus = searchParams.get('fulfillment_status') as FulfillmentStatus | null;
    const search = searchParams.get('search');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // ═══════════════════════════════════════════════════════════
    // CONTEO POR STATUS (para summary cards)
    // ═══════════════════════════════════════════════════════════

    const { data: statusCounts } = await supabase
      .from('public_quotes')
      .select('fulfillment_status')
      .not('fulfillment_status', 'is', null);

    const counts: Record<string, number> = {
      pending_payment: 0,
      paid: 0,
      preparing: 0,
      ready_for_dispatch: 0,
      dispatched: 0,
      in_transit: 0,
      delivered: 0,
      failed_delivery: 0,
      rescheduled: 0,
    };

    if (statusCounts) {
      for (const row of statusCounts) {
        const s = row.fulfillment_status as string;
        if (s in counts) {
          counts[s]++;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // QUERY PRINCIPAL
    // ═══════════════════════════════════════════════════════════

    let query = supabase
      .from('public_quotes')
      .select('*', { count: 'exact' })
      .not('fulfillment_status', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filtro por fulfillment_status
    if (fulfillmentStatus) {
      query = query.eq('fulfillment_status', fulfillmentStatus);
    }

    // Busqueda por nombre, email, telefono, quote_number
    if (search) {
      query = query.or(
        `requester_name.ilike.%${search}%,requester_email.ilike.%${search}%,requester_phone.ilike.%${search}%,quote_number.ilike.%${search}%`
      );
    }

    // Filtro por fecha
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching retail sales:', error);
      return NextResponse.json(
        { error: 'Error al obtener ventas retail' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      counts,
      pagination: {
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/retail-sales:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
