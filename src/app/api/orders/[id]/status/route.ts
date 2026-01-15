/**
 * API: PATCH /api/orders/[id]/status
 * Cambia el estado de una orden con validación de flujo
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidOrderStatusTransition, ORDER_STATUS_LABELS } from '@/lib/utils/format';
import type { OrderStatus, UpdateOrderStatusRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: UpdateOrderStatusRequest = await request.json();
    const supabase = createAdminClient();

    // Validar que se proporciona el nuevo estado
    if (!body.status) {
      return NextResponse.json(
        { error: 'El nuevo estado es requerido' },
        { status: 400 }
      );
    }

    // Obtener orden actual
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, client_id, deposit_status')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    const currentStatus = order.status as OrderStatus;
    const newStatus = body.status;

    // Validar transición de estado
    if (!isValidOrderStatusTransition(currentStatus, newStatus)) {
      return NextResponse.json(
        {
          error: `No se puede cambiar de "${ORDER_STATUS_LABELS[currentStatus]}" a "${ORDER_STATUS_LABELS[newStatus]}"`,
          valid_transitions: getValidTransitions(currentStatus),
        },
        { status: 400 }
      );
    }

    // Validaciones específicas por estado
    if (newStatus === 'confirmed' && order.deposit_status !== 'paid') {
      return NextResponse.json(
        { error: 'No se puede confirmar una orden sin el pago de la seña' },
        { status: 400 }
      );
    }

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    // Actualizar timestamps según el nuevo estado
    const now = new Date().toISOString();

    switch (newStatus) {
      case 'confirmed':
        updateData.confirmed_at = now;
        break;
      case 'in_production':
        updateData.production_started_at = now;
        break;
      case 'ready':
        updateData.ready_at = now;
        break;
      case 'shipped':
        updateData.shipped_at = now;
        break;
      case 'delivered':
        updateData.delivered_at = now;
        break;
      case 'cancelled':
        updateData.cancelled_at = now;
        updateData.cancellation_reason = body.notes || null;
        break;
    }

    // Actualizar orden
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, company),
        quote:quotes(id, quote_number)
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    // Registrar comunicación
    await supabase.from('communications').insert({
      client_id: order.client_id,
      order_id: order.id,
      channel: 'manual',
      direction: 'outbound',
      subject: `Estado actualizado a ${ORDER_STATUS_LABELS[newStatus]}`,
      content: body.notes || `Orden ${order.order_number} cambió a estado: ${ORDER_STATUS_LABELS[newStatus]}`,
      metadata: {
        order_number: order.order_number,
        previous_status: currentStatus,
        new_status: newStatus,
      },
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `Orden ${order.order_number} actualizada a "${ORDER_STATUS_LABELS[newStatus]}"`,
    });
  } catch (error) {
    console.error('Error in PATCH /api/orders/[id]/status:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el estado de la orden' },
      { status: 500 }
    );
  }
}

function getValidTransitions(currentStatus: OrderStatus): string[] {
  const transitions: Record<OrderStatus, OrderStatus[]> = {
    pending_deposit: ['confirmed', 'cancelled'],
    confirmed: ['in_production', 'cancelled'],
    in_production: ['ready', 'cancelled'],
    ready: ['shipped', 'cancelled'],
    shipped: ['delivered'],
    delivered: [],
    cancelled: [],
  };

  return transitions[currentStatus].map(s => ORDER_STATUS_LABELS[s]);
}
