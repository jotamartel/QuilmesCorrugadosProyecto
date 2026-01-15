/**
 * API: GET /api/reports/sales
 * Reporte de ventas por período
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const groupBy = searchParams.get('group_by') || 'day'; // 'day' | 'week' | 'month'

    // Fechas por defecto: último mes
    const endDate = to ? parseISO(to) : new Date();
    const startDate = from ? parseISO(from) : startOfMonth(endDate);

    // Obtener cotizaciones del período
    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('id, total, total_m2, status, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (quotesError) throw quotesError;

    // Obtener órdenes del período
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total, total_m2, status, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .neq('status', 'cancelled');

    if (ordersError) throw ordersError;

    // Generar períodos
    let periods: Date[];

    switch (groupBy) {
      case 'week':
        periods = eachWeekOfInterval({ start: startDate, end: endDate }, { locale: es });
        break;
      case 'month':
        periods = eachMonthOfInterval({ start: startDate, end: endDate });
        break;
      default: // day
        periods = eachDayOfInterval({ start: startDate, end: endDate });
    }

    // Agrupar datos por período
    const report = periods.map(periodStart => {
      let periodEnd: Date;
      let periodLabel: string;

      switch (groupBy) {
        case 'week':
          periodEnd = endOfWeek(periodStart, { locale: es });
          periodLabel = `Sem. ${format(periodStart, 'dd/MM', { locale: es })}`;
          break;
        case 'month':
          periodEnd = endOfMonth(periodStart);
          periodLabel = format(periodStart, 'MMM yyyy', { locale: es });
          break;
        default:
          periodEnd = periodStart;
          periodLabel = format(periodStart, 'dd/MM', { locale: es });
      }

      // Filtrar cotizaciones del período
      const periodQuotes = (quotes || []).filter(q => {
        const date = new Date(q.created_at);
        return date >= periodStart && date <= periodEnd;
      });

      // Filtrar órdenes del período
      const periodOrders = (orders || []).filter(o => {
        const date = new Date(o.created_at);
        return date >= periodStart && date <= periodEnd;
      });

      const totalQuotes = periodQuotes.length;
      const totalOrders = periodOrders.length;
      const totalM2 = periodOrders.reduce((sum, o) => sum + Number(o.total_m2), 0);
      const totalRevenue = periodOrders.reduce((sum, o) => sum + Number(o.total), 0);
      const conversionRate = totalQuotes > 0 ? (totalOrders / totalQuotes) * 100 : 0;

      return {
        period: periodLabel,
        period_start: format(periodStart, 'yyyy-MM-dd'),
        period_end: format(periodEnd, 'yyyy-MM-dd'),
        total_quotes: totalQuotes,
        total_orders: totalOrders,
        total_m2: Math.round(totalM2 * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        conversion_rate: Math.round(conversionRate * 10) / 10,
      };
    });

    // Totales generales
    const summary = {
      total_quotes: (quotes || []).length,
      total_orders: (orders || []).length,
      total_m2: (orders || []).reduce((sum, o) => sum + Number(o.total_m2), 0),
      total_revenue: (orders || []).reduce((sum, o) => sum + Number(o.total), 0),
      conversion_rate: quotes && quotes.length > 0
        ? ((orders || []).length / quotes.length) * 100
        : 0,
      period_from: format(startDate, 'yyyy-MM-dd'),
      period_to: format(endDate, 'yyyy-MM-dd'),
    };

    return NextResponse.json({
      data: report,
      summary: {
        ...summary,
        total_m2: Math.round(summary.total_m2 * 100) / 100,
        total_revenue: Math.round(summary.total_revenue * 100) / 100,
        conversion_rate: Math.round(summary.conversion_rate * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/reports/sales:', error);
    return NextResponse.json(
      { error: 'Error al generar reporte de ventas' },
      { status: 500 }
    );
  }
}
