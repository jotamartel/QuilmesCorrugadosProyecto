/**
 * API: GET /api/reports/production
 * Reporte de m² producidos/pendientes por estado
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/types/database';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Obtener todas las órdenes no canceladas
    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, total_m2, total')
      .neq('status', 'cancelled');

    if (error) throw error;

    // Agrupar por estado
    const statusGroups: Record<OrderStatus, { count: number; total_m2: number; total_revenue: number }> = {
      pending_deposit: { count: 0, total_m2: 0, total_revenue: 0 },
      confirmed: { count: 0, total_m2: 0, total_revenue: 0 },
      in_production: { count: 0, total_m2: 0, total_revenue: 0 },
      ready: { count: 0, total_m2: 0, total_revenue: 0 },
      shipped: { count: 0, total_m2: 0, total_revenue: 0 },
      delivered: { count: 0, total_m2: 0, total_revenue: 0 },
      cancelled: { count: 0, total_m2: 0, total_revenue: 0 },
    };

    (orders || []).forEach(order => {
      const status = order.status as OrderStatus;
      if (statusGroups[status]) {
        statusGroups[status].count += 1;
        statusGroups[status].total_m2 += Number(order.total_m2);
        statusGroups[status].total_revenue += Number(order.total);
      }
    });

    // Convertir a array para la respuesta
    const report = Object.entries(statusGroups)
      .filter(([status]) => status !== 'cancelled')
      .map(([status, data]) => ({
        status,
        status_label: ORDER_STATUS_LABELS[status as OrderStatus],
        count: data.count,
        total_m2: Math.round(data.total_m2 * 100) / 100,
        total_revenue: Math.round(data.total_revenue * 100) / 100,
      }));

    // Calcular métricas especiales
    const pendingProduction = ['pending_deposit', 'confirmed'];
    const inProgress = ['in_production'];
    const completed = ['ready', 'shipped', 'delivered'];

    const summary = {
      pending_m2: pendingProduction.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].total_m2,
        0
      ),
      pending_count: pendingProduction.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].count,
        0
      ),
      in_production_m2: inProgress.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].total_m2,
        0
      ),
      in_production_count: inProgress.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].count,
        0
      ),
      completed_m2: completed.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].total_m2,
        0
      ),
      completed_count: completed.reduce(
        (sum, s) => sum + statusGroups[s as OrderStatus].count,
        0
      ),
      total_m2: (orders || []).reduce((sum, o) => sum + Number(o.total_m2), 0),
      total_orders: (orders || []).length,
    };

    return NextResponse.json({
      data: report,
      summary: {
        ...summary,
        pending_m2: Math.round(summary.pending_m2 * 100) / 100,
        in_production_m2: Math.round(summary.in_production_m2 * 100) / 100,
        completed_m2: Math.round(summary.completed_m2 * 100) / 100,
        total_m2: Math.round(summary.total_m2 * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/reports/production:', error);
    return NextResponse.json(
      { error: 'Error al generar reporte de producción' },
      { status: 500 }
    );
  }
}
