import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ConfirmQuantitiesRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/confirm-quantities - Confirmar cantidades entregadas
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: orderId } = await params;
    const supabase = createAdminClient();
    const body: ConfirmQuantitiesRequest = await request.json();

    // Verificar que la orden exista y esté en estado correcto
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('status, quantities_confirmed')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    if (order.status !== 'ready') {
      return NextResponse.json(
        { error: 'La orden debe estar en estado "Lista" para confirmar cantidades' },
        { status: 400 }
      );
    }

    if (order.quantities_confirmed) {
      return NextResponse.json(
        { error: 'Las cantidades ya fueron confirmadas' },
        { status: 400 }
      );
    }

    // Actualizar cantidades de cada item
    for (const item of body.items) {
      const { error: itemError } = await supabase
        .from('order_items')
        .update({ quantity_delivered: item.quantity_delivered })
        .eq('id', item.id)
        .eq('order_id', orderId);

      if (itemError) {
        throw itemError;
      }
    }

    // Recalcular totales basados en cantidades entregadas
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('quantity, quantity_delivered, m2_per_box')
      .eq('order_id', orderId);

    if (itemsError) {
      throw itemsError;
    }

    // Calcular nuevo total de m2
    const newTotalM2 = items.reduce((sum, item) => {
      const qty = item.quantity_delivered || item.quantity;
      return sum + (qty * item.m2_per_box);
    }, 0);

    // Obtener orden completa para recalcular
    const { data: fullOrder, error: fullOrderError } = await supabase
      .from('orders')
      .select(`
        total_m2, subtotal, total,
        deposit_amount, deposit_status,
        balance_amount, balance_status,
        printing_cost, die_cut_cost, shipping_cost
      `)
      .eq('id', orderId)
      .single();

    if (fullOrderError || !fullOrder) {
      throw new Error('Error obteniendo orden');
    }

    // Guardar valores originales para el registro de precisión
    const originalTotalM2 = fullOrder.total_m2;

    // Calcular el nuevo total de m2 entregado
    const deliveredTotalM2 = items.reduce((sum, item) => {
      const qty = item.quantity_delivered ?? item.quantity;
      return sum + (qty * Number(item.m2_per_box));
    }, 0);

    // Calcular factor de ajuste basado en m2
    const adjustmentFactor = deliveredTotalM2 / originalTotalM2;

    // Calcular nuevo subtotal (proporcional a m2)
    const newSubtotal = Number(fullOrder.subtotal) * adjustmentFactor;

    // Costos fijos no cambian (impresión, troquelado, envío)
    const fixedCosts =
      Number(fullOrder.printing_cost || 0) +
      Number(fullOrder.die_cut_cost || 0) +
      Number(fullOrder.shipping_cost || 0);

    // Nuevo total = nuevo subtotal + costos fijos
    const newTotal = newSubtotal + fixedCosts;

    // La seña ya fue pagada, no la cambiamos
    const depositAmount = Number(fullOrder.deposit_amount);
    const depositPaid = fullOrder.deposit_status === 'paid';

    // El balance es lo que resta pagar
    // Si entregamos menos, el balance puede ser menor que la seña
    // Si entregamos más, el balance aumenta
    let newBalanceAmount: number;

    if (depositPaid) {
      // La seña ya se pagó, el balance es el nuevo total menos lo ya pagado
      newBalanceAmount = Math.max(0, newTotal - depositAmount);
    } else {
      // Si la seña no se pagó aún, mantener el esquema 50/50
      newBalanceAmount = newTotal * 0.5;
    }

    // Actualizar total_m2 de cada item según cantidad entregada
    for (const item of items) {
      const deliveredQty = item.quantity_delivered ?? item.quantity;
      const newItemTotalM2 = deliveredQty * Number(item.m2_per_box);

      // Buscar el item en body.items para obtener su ID
      const bodyItem = body.items.find(bi => {
        // Ya actualizamos quantity_delivered arriba, así que buscamos por cantidad
        return true; // Simplificamos, el total_m2 se recalcula abajo
      });
    }

    // Actualizar orden con nuevos totales
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        quantities_confirmed: true,
        quantities_confirmed_at: new Date().toISOString(),
        // No cambiamos total_m2 original para mantener el registro histórico
        // El m2 entregado se calcula sumando items.quantity_delivered * m2_per_box
        subtotal: Math.round(newSubtotal * 100) / 100,
        total: Math.round(newTotal * 100) / 100,
        // No cambiamos deposit_amount si ya fue pagado
        balance_amount: Math.round(newBalanceAmount * 100) / 100,
      })
      .eq('id', orderId);

    if (updateError) {
      throw updateError;
    }

    // Calcular precisión de producción
    const precisionPercent = (deliveredTotalM2 / originalTotalM2) * 100;

    return NextResponse.json({
      message: 'Cantidades confirmadas correctamente',
      original: {
        total_m2: originalTotalM2,
        total: fullOrder.total,
      },
      delivered: {
        total_m2: deliveredTotalM2,
        subtotal: Math.round(newSubtotal * 100) / 100,
        total: Math.round(newTotal * 100) / 100,
        balance_amount: Math.round(newBalanceAmount * 100) / 100,
      },
      precision_percent: Math.round(precisionPercent * 100) / 100,
    });
  } catch (error) {
    console.error('Error confirmando cantidades:', error);
    return NextResponse.json(
      { error: 'Error al confirmar cantidades' },
      { status: 500 }
    );
  }
}
