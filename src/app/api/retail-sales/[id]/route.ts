/**
 * API: /api/retail-sales/[id]
 * GET  - Detalle de venta retail
 * PATCH - Actualizar fulfillment_status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FulfillmentStatus } from '@/lib/types/database';
import { FULFILLMENT_STATUS_LABELS } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Flujo valido de transiciones de fulfillment
const FULFILLMENT_FLOW: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  pending_payment: ['paid'],
  paid: ['preparing'],
  preparing: ['ready_for_dispatch'],
  ready_for_dispatch: ['dispatched'],
  dispatched: ['in_transit'],
  in_transit: ['delivered', 'failed_delivery'],
  delivered: [],
  failed_delivery: ['rescheduled'],
  rescheduled: ['ready_for_dispatch'],
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('public_quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /api/retail-sales/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const newStatus = body.fulfillment_status as FulfillmentStatus;

    if (!newStatus) {
      return NextResponse.json(
        { error: 'El nuevo estado es requerido' },
        { status: 400 }
      );
    }

    // Obtener estado actual
    const { data: current, error: fetchError } = await supabase
      .from('public_quotes')
      .select('id, quote_number, fulfillment_status')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { error: 'Venta no encontrada' },
        { status: 404 }
      );
    }

    const currentStatus = (current.fulfillment_status || 'pending_payment') as FulfillmentStatus;

    // Validar transicion
    const validTransitions = FULFILLMENT_FLOW[currentStatus] || [];
    if (!validTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `No se puede cambiar de "${FULFILLMENT_STATUS_LABELS[currentStatus]}" a "${FULFILLMENT_STATUS_LABELS[newStatus]}"`,
          valid_transitions: validTransitions.map(s => ({
            status: s,
            label: FULFILLMENT_STATUS_LABELS[s],
          })),
        },
        { status: 400 }
      );
    }

    // Preparar update
    const updateData: Record<string, unknown> = {
      fulfillment_status: newStatus,
    };

    const now = new Date().toISOString();

    switch (newStatus) {
      case 'dispatched':
        updateData.dispatched_at = now;
        break;
      case 'delivered':
        updateData.delivered_at = now;
        break;
      case 'failed_delivery':
        updateData.failed_delivery_reason = body.reason || null;
        updateData.driver_notes = body.notes || null;
        break;
      case 'rescheduled':
        updateData.reschedule_date = body.reschedule_date || null;
        break;
    }

    // Actualizar
    const { data: updated, error: updateError } = await supabase
      .from('public_quotes')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Error updating retail sale:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar la venta' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Pedido actualizado a "${FULFILLMENT_STATUS_LABELS[newStatus]}"`,
    });
  } catch (error) {
    console.error('Error in PATCH /api/retail-sales/[id]:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
