/**
 * API: /api/costs/profitability
 * Análisis de rentabilidad
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseISO, startOfMonth, endOfMonth, format } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Por defecto, mes actual
    const endDate = to ? parseISO(to) : endOfMonth(new Date());
    const startDate = from ? parseISO(from) : startOfMonth(new Date());

    // Obtener órdenes del período
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        created_at,
        status,
        total_m2,
        subtotal,
        printing_cost,
        die_cut_cost,
        shipping_cost,
        total,
        client:clients(id, name, company)
      `)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    // Obtener costos directos por orden
    const orderIds = orders?.map(o => o.id) || [];
    let orderCosts: Record<string, number> = {};

    if (orderIds.length > 0) {
      const { data: costs } = await supabase
        .from('order_costs')
        .select('order_id, amount')
        .in('order_id', orderIds);

      orderCosts = (costs || []).reduce((acc, c) => {
        acc[c.order_id] = (acc[c.order_id] || 0) + Number(c.amount);
        return acc;
      }, {} as Record<string, number>);
    }

    // Obtener configuración de costos de producción
    const { data: prodConfig } = await supabase
      .from('production_cost_config')
      .select('*')
      .eq('is_active', true)
      .is('effective_to', null)
      .limit(1)
      .single();

    // Calcular costo estimado por m2
    let estimatedCostPerM2 = 0;
    if (prodConfig) {
      const baseCost =
        Number(prodConfig.cardboard_cost_per_m2) +
        Number(prodConfig.glue_cost_per_m2) +
        Number(prodConfig.ink_cost_per_m2) +
        Number(prodConfig.labor_cost_per_m2) +
        Number(prodConfig.energy_cost_per_m2);
      const wasteAdjustment = baseCost * (Number(prodConfig.waste_percentage) / 100);
      const overheadAdjustment = baseCost * (Number(prodConfig.overhead_percentage) / 100);
      estimatedCostPerM2 = baseCost + wasteAdjustment + overheadAdjustment;
    }

    // Obtener costos fijos del período
    const { data: fixedCosts } = await supabase
      .from('fixed_costs')
      .select('amount, frequency')
      .eq('is_active', true)
      .lte('start_date', endDate.toISOString().split('T')[0])
      .or(`end_date.is.null,end_date.gte.${startDate.toISOString().split('T')[0]}`);

    // Calcular costos fijos mensuales
    const monthlyFixedCosts = (fixedCosts || []).reduce((sum, cost) => {
      let monthly = Number(cost.amount);
      switch (cost.frequency) {
        case 'daily': monthly = monthly * 30; break;
        case 'weekly': monthly = monthly * 4.33; break;
        case 'yearly': monthly = monthly / 12; break;
      }
      return sum + monthly;
    }, 0);

    // Obtener gastos operativos del período
    const { data: expenses } = await supabase
      .from('operational_expenses')
      .select('amount')
      .gte('expense_date', startDate.toISOString().split('T')[0])
      .lte('expense_date', endDate.toISOString().split('T')[0]);

    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);

    // Calcular rentabilidad por orden
    const ordersWithProfitability = (orders || []).map(order => {
      const directCosts = orderCosts[order.id] || 0;
      const estimatedProductionCost = Number(order.total_m2) * estimatedCostPerM2;
      const totalCosts = directCosts > 0 ? directCosts : estimatedProductionCost;
      const grossProfit = Number(order.total) - totalCosts;
      const grossMargin = Number(order.total) > 0 ? (grossProfit / Number(order.total)) * 100 : 0;

      const clientData = order.client as unknown;
      const client = Array.isArray(clientData) ? clientData[0] as { id: string; name: string; company: string | null } | undefined : clientData as { id: string; name: string; company: string | null } | null;

      return {
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.created_at,
        status: order.status,
        client_name: client?.name || 'Sin cliente',
        client_company: client?.company || null,
        total_m2: Number(order.total_m2),
        total_revenue: Number(order.total),
        direct_costs: Math.round(totalCosts * 100) / 100,
        gross_profit: Math.round(grossProfit * 100) / 100,
        gross_margin_percent: Math.round(grossMargin * 10) / 10,
        has_tracked_costs: directCosts > 0,
      };
    });

    // Totales
    const totalRevenue = ordersWithProfitability.reduce((sum, o) => sum + o.total_revenue, 0);
    const totalM2 = ordersWithProfitability.reduce((sum, o) => sum + o.total_m2, 0);
    const totalDirectCosts = ordersWithProfitability.reduce((sum, o) => sum + o.direct_costs, 0);
    const totalGrossProfit = totalRevenue - totalDirectCosts;
    const totalFixedAndOperational = monthlyFixedCosts + totalExpenses;
    const netProfit = totalGrossProfit - totalFixedAndOperational;

    return NextResponse.json({
      orders: ordersWithProfitability,
      summary: {
        period: {
          from: format(startDate, 'yyyy-MM-dd'),
          to: format(endDate, 'yyyy-MM-dd'),
        },
        total_orders: ordersWithProfitability.length,
        total_m2: Math.round(totalM2 * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_direct_costs: Math.round(totalDirectCosts * 100) / 100,
        gross_profit: Math.round(totalGrossProfit * 100) / 100,
        gross_margin_percent: totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 1000) / 10 : 0,
        fixed_costs: Math.round(monthlyFixedCosts * 100) / 100,
        operational_expenses: Math.round(totalExpenses * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        net_margin_percent: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
        avg_revenue_per_m2: totalM2 > 0 ? Math.round((totalRevenue / totalM2) * 100) / 100 : 0,
        avg_cost_per_m2: totalM2 > 0 ? Math.round((totalDirectCosts / totalM2) * 100) / 100 : 0,
        estimated_cost_per_m2: Math.round(estimatedCostPerM2 * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/costs/profitability:', error);
    return NextResponse.json(
      { error: 'Error al calcular rentabilidad' },
      { status: 500 }
    );
  }
}
