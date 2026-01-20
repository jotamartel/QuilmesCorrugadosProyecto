/**
 * API: GET /api/reports/clients
 * Reporte de top clientes por facturación
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseISO } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get('limit') || '10');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Construir query base
    let query = supabase
      .from('orders')
      .select(`
        client_id,
        total,
        total_m2,
        created_at,
        client:clients(id, name, company)
      `)
      .neq('status', 'cancelled');

    // Aplicar filtros de fecha si existen
    if (from) {
      query = query.gte('created_at', parseISO(from).toISOString());
    }
    if (to) {
      const endDate = parseISO(to);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endDate.toISOString());
    }

    // Obtener órdenes agrupadas por cliente
    const { data: orders, error: ordersError } = await query;

    if (ordersError) throw ordersError;

    // Agrupar por cliente
    const clientStats: Record<string, {
      client_id: string;
      client_name: string;
      company: string | null;
      total_orders: number;
      total_m2: number;
      total_revenue: number;
    }> = {};

    (orders || []).forEach(order => {
      if (!order.client_id) return;

      if (!clientStats[order.client_id]) {
        const clientData = order.client as unknown as { id: string; name: string; company: string | null } | null;
        clientStats[order.client_id] = {
          client_id: order.client_id,
          client_name: clientData?.name || 'Sin nombre',
          company: clientData?.company || null,
          total_orders: 0,
          total_m2: 0,
          total_revenue: 0,
        };
      }

      clientStats[order.client_id].total_orders += 1;
      clientStats[order.client_id].total_m2 += Number(order.total_m2);
      clientStats[order.client_id].total_revenue += Number(order.total);
    });

    // Convertir a array y ordenar por facturación
    const topClients = Object.values(clientStats)
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit)
      .map((client, index) => ({
        rank: index + 1,
        ...client,
        total_m2: Math.round(client.total_m2 * 100) / 100,
        total_revenue: Math.round(client.total_revenue * 100) / 100,
      }));

    // Calcular totales
    const allClients = Object.values(clientStats);
    const summary = {
      total_clients: allClients.length,
      total_revenue: allClients.reduce((sum, c) => sum + c.total_revenue, 0),
      total_m2: allClients.reduce((sum, c) => sum + c.total_m2, 0),
      total_orders: allClients.reduce((sum, c) => sum + c.total_orders, 0),
      top_clients_revenue: topClients.reduce((sum, c) => sum + c.total_revenue, 0),
      top_clients_percentage: 0,
    };

    summary.top_clients_percentage = summary.total_revenue > 0
      ? (summary.top_clients_revenue / summary.total_revenue) * 100
      : 0;

    return NextResponse.json({
      data: topClients,
      summary: {
        ...summary,
        total_revenue: Math.round(summary.total_revenue * 100) / 100,
        total_m2: Math.round(summary.total_m2 * 100) / 100,
        top_clients_revenue: Math.round(summary.top_clients_revenue * 100) / 100,
        top_clients_percentage: Math.round(summary.top_clients_percentage * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/reports/clients:', error);
    return NextResponse.json(
      { error: 'Error al generar reporte de clientes' },
      { status: 500 }
    );
  }
}
