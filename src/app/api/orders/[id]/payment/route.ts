/**
 * API: PATCH /api/orders/[id]/payment
 * Registra un pago (seña o saldo)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/format';
import type { RegisterPaymentRequest, PaymentMethod } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: RegisterPaymentRequest = await request.json();
    const supabase = createAdminClient();

    // Validar campos requeridos
    if (!body.payment_type || !['deposit', 'balance'].includes(body.payment_type)) {
      return NextResponse.json(
        { error: 'payment_type debe ser "deposit" o "balance"' },
        { status: 400 }
      );
    }

    if (!body.method) {
      return NextResponse.json(
        { error: 'El método de pago es requerido' },
        { status: 400 }
      );
    }

    const validMethods: PaymentMethod[] = ['transferencia', 'cheque', 'efectivo', 'echeq'];
    if (!validMethods.includes(body.method)) {
      return NextResponse.json(
        { error: `Método de pago inválido. Válidos: ${validMethods.join(', ')}` },
        { status: 400 }
      );
    }

    // Validar datos del cheque si es pago con cheque
    const isCheckPayment = body.method === 'cheque' || body.method === 'echeq';
    if (isCheckPayment) {
      if (!body.check_bank || !body.check_number || !body.check_date) {
        return NextResponse.json(
          { error: 'Para pagos con cheque debe indicar banco, número y fecha de vencimiento' },
          { status: 400 }
        );
      }
    }

    // Obtener orden
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, status, client_id, deposit_status, balance_status, deposit_amount, balance_amount')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    // Validar que la orden no está cancelada o entregada
    if (order.status === 'cancelled') {
      return NextResponse.json(
        { error: 'No se pueden registrar pagos en órdenes canceladas' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {};
    let paymentAmount: number;
    let paymentLabel: string;

    if (body.payment_type === 'deposit') {
      // Validar que no esté ya pagada
      if (order.deposit_status === 'paid') {
        return NextResponse.json(
          { error: 'La seña ya fue pagada' },
          { status: 400 }
        );
      }

      updateData.deposit_status = 'paid';
      updateData.deposit_method = body.method;
      updateData.deposit_paid_at = now;
      paymentAmount = order.deposit_amount;
      paymentLabel = 'Seña';
    } else {
      // Balance
      // Validar que la seña esté pagada primero
      if (order.deposit_status !== 'paid') {
        return NextResponse.json(
          { error: 'No se puede registrar el saldo sin haber pagado la seña' },
          { status: 400 }
        );
      }

      if (order.balance_status === 'paid') {
        return NextResponse.json(
          { error: 'El saldo ya fue pagado' },
          { status: 400 }
        );
      }

      updateData.balance_status = 'paid';
      updateData.balance_method = body.method;
      updateData.balance_paid_at = now;
      paymentAmount = order.balance_amount;
      paymentLabel = 'Saldo';
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

    // Si es cheque, crear registro en la cartera de cheques
    if (isCheckPayment && body.check_bank && body.check_number && body.check_date) {
      // Primero crear el pago
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          order_id: id,
          client_id: order.client_id,
          type: body.payment_type,
          amount: paymentAmount,
          method: body.method,
          check_bank: body.check_bank,
          check_number: body.check_number,
          check_date: body.check_date,
          check_holder: body.check_holder || null,
          check_cuit: body.check_cuit || null,
          status: 'completed',
        })
        .select()
        .single();

      // Luego crear el cheque en cartera
      await supabase.from('checks').insert({
        payment_id: payment?.id || null,
        client_id: order.client_id,
        bank: body.check_bank,
        number: body.check_number,
        amount: paymentAmount,
        due_date: body.check_date,
        holder: body.check_holder || null,
        holder_cuit: body.check_cuit || null,
        status: 'in_portfolio',
      });
    }

    // Registrar comunicación
    await supabase.from('communications').insert({
      client_id: order.client_id,
      order_id: order.id,
      channel: 'manual',
      direction: 'inbound',
      subject: `Pago registrado: ${paymentLabel}`,
      content: `${paymentLabel} de $${paymentAmount.toLocaleString('es-AR')} pagado vía ${PAYMENT_METHOD_LABELS[body.method]}${isCheckPayment ? ` - Cheque ${body.check_bank} #${body.check_number}` : ''}`,
      metadata: {
        order_number: order.order_number,
        payment_type: body.payment_type,
        payment_method: body.method,
        amount: paymentAmount,
        ...(isCheckPayment && {
          check_bank: body.check_bank,
          check_number: body.check_number,
          check_date: body.check_date,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `${paymentLabel} de $${paymentAmount.toLocaleString('es-AR')} registrado correctamente`,
    });
  } catch (error) {
    console.error('Error in PATCH /api/orders/[id]/payment:', error);
    return NextResponse.json(
      { error: 'Error al registrar el pago' },
      { status: 500 }
    );
  }
}
