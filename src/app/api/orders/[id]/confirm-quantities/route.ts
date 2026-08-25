import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificarEventoDePedido, type ResultadoAviso } from '@/lib/notificaciones-pedido';
import { repartirElPago } from '@/lib/pagos/esquemas';
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
        order_number, total_m2, subtotal, total,
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
      // Si la seña no se pagó aún, se mantiene la condición estándar.
      newBalanceAmount = repartirElPago(newTotal).contraEntrega;
    }

    // (Aca habia un for muerto que "actualizaba" total_m2 por item sin hacer
    // nada. No hace falta: el m² entregado se re-deriva siempre sumando
    // quantity_delivered * m2_per_box, no se persiste calculado.)

    // EL SNAPSHOT VA ANTES DEL UPDATE, Y SI FALLA SE CORTA.
    //
    // Este update pisa subtotal, total y balance_amount: sin esta fila el
    // presupuesto original desaparece y un reclamo de "me cotizaste X" no se
    // puede reconstruir. Se inserta ANTES para que un fallo en el historial
    // aborte el ajuste — perder el rastro es peor que reintentarlo.
    const precisionPct = Math.round((deliveredTotalM2 / originalTotalM2) * 10000) / 100;
    const { error: snapshotError } = await supabase
      .from('order_quantity_adjustments')
      .insert({
        order_id: orderId,
        previous_subtotal: fullOrder.subtotal,
        previous_total: fullOrder.total,
        previous_balance_amount: fullOrder.balance_amount,
        previous_total_m2: originalTotalM2,
        delivered_total_m2: Math.round(deliveredTotalM2 * 100) / 100,
        new_subtotal: Math.round(newSubtotal * 100) / 100,
        new_total: Math.round(newTotal * 100) / 100,
        new_balance_amount: Math.round(newBalanceAmount * 100) / 100,
        precision_percent: precisionPct,
        // Hoy el handler no valida sesion (la compuerta del proxy si), asi que
        // no hay email para anotar. Cuando se sume, va aca.
        adjusted_by: null,
      });

    if (snapshotError) {
      throw snapshotError;
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

    const balanceRedondeado = Math.round(newBalanceAmount * 100) / 100;

    // Este es EL aviso que pidio Fernando: "confirmas cantidades y le manda la
    // diferencia a pagar". Sale despues del update, y el motor vuelve a leer la
    // orden en vez de recibir el numero: asi lo que se le dice al cliente es lo
    // que quedo escrito, no lo que este handler creia estar escribiendo.
    let aviso: ResultadoAviso | null = null;
    if (body.notificar !== false) {
      aviso = await notificarEventoDePedido({
        orderId,
        evento: 'saldo_actualizado',
        actor: body.actor,
      });
    }

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
        balance_amount: balanceRedondeado,
      },
      precision_percent: precisionPct,
      aviso,
      // Todo lo que el aviso al cliente necesita, ya resuelto aca
      // donde se conocen los numeros. El que avisa no re-deriva nada: lee.
      notification_payload: {
        order_number: fullOrder.order_number,
        new_total: Math.round(newTotal * 100) / 100,
        new_balance_amount: balanceRedondeado,
        deposit_amount: depositAmount,
        delivered_total_m2: Math.round(deliveredTotalM2 * 100) / 100,
        original_total_m2: originalTotalM2,
        precision_percent: precisionPct,
        // Si no hay saldo, el aviso de "saldo actualizado" no corresponde.
        requires_payment: balanceRedondeado > 0.01,
        // Se entrego tan poco que la seña supera el total nuevo: hay plata a
        // devolver y eso se maneja a mano, con aviso al equipo.
        needs_refund: depositPaid && depositAmount > newTotal + 0.01,
        variacion_pct: Math.round((deliveredTotalM2 / originalTotalM2 - 1) * 10000) / 100,
      },
    });
  } catch (error) {
    console.error('Error confirmando cantidades:', error);
    return NextResponse.json(
      { error: 'Error al confirmar cantidades' },
      { status: 500 }
    );
  }
}
