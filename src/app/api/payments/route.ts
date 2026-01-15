import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreatePaymentRequest } from '@/lib/types/database';

// GET /api/payments - Listar pagos
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const orderId = searchParams.get('order_id');
    const clientId = searchParams.get('client_id');
    const status = searchParams.get('status');

    let query = supabase
      .from('payments')
      .select(`
        *,
        order:orders(order_number),
        client:clients(name, company)
      `)
      .order('created_at', { ascending: false });

    if (orderId) {
      query = query.eq('order_id', orderId);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error listando pagos:', error);
    return NextResponse.json(
      { error: 'Error al listar pagos' },
      { status: 500 }
    );
  }
}

// POST /api/payments - Crear pago
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body: CreatePaymentRequest = await request.json();

    if (!body.order_id || !body.type || !body.amount || !body.method) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    // Obtener orden para verificar client_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('client_id')
      .eq('id', body.order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    // Crear pago
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        order_id: body.order_id,
        client_id: order.client_id,
        type: body.type,
        amount: body.amount,
        method: body.method,
        check_bank: body.check_bank,
        check_number: body.check_number,
        check_date: body.check_date,
        check_holder: body.check_holder,
        check_cuit: body.check_cuit,
        notes: body.notes,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Si es cheque, crear registro en cartera
    if ((body.method === 'cheque' || body.method === 'echeq') && body.check_bank && body.check_number && body.check_date) {
      await supabase.from('checks').insert({
        payment_id: payment.id,
        client_id: order.client_id,
        bank: body.check_bank,
        number: body.check_number,
        amount: body.amount,
        due_date: body.check_date,
        holder: body.check_holder,
        holder_cuit: body.check_cuit,
        status: 'in_portfolio',
      });
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Error creando pago:', error);
    return NextResponse.json(
      { error: 'Error al crear pago' },
      { status: 500 }
    );
  }
}
