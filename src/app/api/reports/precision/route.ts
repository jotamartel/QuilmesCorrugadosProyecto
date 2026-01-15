/**
 * API: GET /api/reports/precision
 * Reporte de precisión de producción
 * Compara cantidades cotizadas vs entregadas
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface PrecisionData {
  order_id: string;
  order_number: string;
  client_name: string;
  client_company: string | null;
  confirmed_at: string;
  original_m2: number;
  delivered_m2: number;
  precision_percent: number;
  difference_m2: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros opcionales
    const limit = parseInt(searchParams.get('limit') || '50');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // Obtener órdenes con cantidades confirmadas
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        quantities_confirmed_at,
        total_m2,
        client:clients(name, company),
        items:order_items(quantity, quantity_delivered, m2_per_box)
      `)
      .eq('quantities_confirmed', true)
      .not('quantities_confirmed_at', 'is', null)
      .order('quantities_confirmed_at', { ascending: false })
      .limit(limit);

    if (startDate) {
      query = query.gte('quantities_confirmed_at', startDate);
    }
    if (endDate) {
      query = query.lte('quantities_confirmed_at', endDate);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    // Procesar datos de precisión
    const precisionData: PrecisionData[] = [];
    let totalOriginalM2 = 0;
    let totalDeliveredM2 = 0;
    let perfectOrders = 0; // Órdenes con 100% precisión
    let underDelivered = 0; // Órdenes con menos de lo cotizado
    let overDelivered = 0; // Órdenes con más de lo cotizado

    for (const order of orders || []) {
      const items = order.items as Array<{
        quantity: number;
        quantity_delivered: number | null;
        m2_per_box: number;
      }>;

      // Calcular m2 original y entregado
      const originalM2 = items.reduce(
        (sum, item) => sum + item.quantity * Number(item.m2_per_box),
        0
      );
      const deliveredM2 = items.reduce((sum, item) => {
        const delivered = item.quantity_delivered ?? item.quantity;
        return sum + delivered * Number(item.m2_per_box);
      }, 0);

      const precisionPercent = originalM2 > 0 ? (deliveredM2 / originalM2) * 100 : 100;
      const differenceM2 = deliveredM2 - originalM2;

      // Contadores
      totalOriginalM2 += originalM2;
      totalDeliveredM2 += deliveredM2;

      if (Math.abs(differenceM2) < 0.01) {
        perfectOrders++;
      } else if (differenceM2 < 0) {
        underDelivered++;
      } else {
        overDelivered++;
      }

      // El cliente puede venir como array o como objeto único dependiendo de la relación
      const clientData = order.client;
      const client = Array.isArray(clientData)
        ? clientData[0] as { name: string; company: string | null } | undefined
        : clientData as { name: string; company: string | null } | null;

      precisionData.push({
        order_id: order.id,
        order_number: order.order_number,
        client_name: client?.name || 'Sin cliente',
        client_company: client?.company || null,
        confirmed_at: order.quantities_confirmed_at,
        original_m2: Math.round(originalM2 * 100) / 100,
        delivered_m2: Math.round(deliveredM2 * 100) / 100,
        precision_percent: Math.round(precisionPercent * 100) / 100,
        difference_m2: Math.round(differenceM2 * 100) / 100,
      });
    }

    // Calcular estadísticas generales
    const totalOrders = precisionData.length;
    const averagePrecision =
      totalOrders > 0
        ? precisionData.reduce((sum, p) => sum + p.precision_percent, 0) / totalOrders
        : 0;

    // Calcular distribución por rangos de precisión
    const precisionRanges = {
      perfect: precisionData.filter((p) => p.precision_percent === 100).length,
      above_98: precisionData.filter(
        (p) => p.precision_percent >= 98 && p.precision_percent < 100
      ).length,
      above_95: precisionData.filter(
        (p) => p.precision_percent >= 95 && p.precision_percent < 98
      ).length,
      above_90: precisionData.filter(
        (p) => p.precision_percent >= 90 && p.precision_percent < 95
      ).length,
      below_90: precisionData.filter((p) => p.precision_percent < 90).length,
    };

    return NextResponse.json({
      data: precisionData,
      summary: {
        total_orders: totalOrders,
        average_precision: Math.round(averagePrecision * 100) / 100,
        total_original_m2: Math.round(totalOriginalM2 * 100) / 100,
        total_delivered_m2: Math.round(totalDeliveredM2 * 100) / 100,
        total_difference_m2: Math.round((totalDeliveredM2 - totalOriginalM2) * 100) / 100,
        perfect_orders: perfectOrders,
        under_delivered: underDelivered,
        over_delivered: overDelivered,
        precision_ranges: precisionRanges,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/reports/precision:', error);
    return NextResponse.json(
      { error: 'Error al generar reporte de precisión' },
      { status: 500 }
    );
  }
}
