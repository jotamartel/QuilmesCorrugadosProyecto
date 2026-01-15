import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateCheckRequest } from '@/lib/types/database';

// GET /api/checks - Listar cheques
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const clientId = searchParams.get('client_id');
    const dueSoon = searchParams.get('due_soon') === 'true';

    let query = supabase
      .from('checks')
      .select(`
        *,
        client:clients(name, company),
        payment:payments(order_id)
      `)
      .order('due_date', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    if (dueSoon) {
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      query = query
        .eq('status', 'in_portfolio')
        .gte('due_date', today)
        .lte('due_date', weekFromNow);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Agregar días hasta vencimiento
    const today = new Date();
    const checksWithDays = data.map((check) => ({
      ...check,
      days_until_due: Math.ceil(
        (new Date(check.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));

    return NextResponse.json(checksWithDays);
  } catch (error) {
    console.error('Error listando cheques:', error);
    return NextResponse.json(
      { error: 'Error al listar cheques' },
      { status: 500 }
    );
  }
}

// POST /api/checks - Crear cheque manualmente
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body: CreateCheckRequest = await request.json();

    if (!body.client_id || !body.bank || !body.number || !body.amount || !body.due_date) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('checks')
      .insert({
        payment_id: body.payment_id,
        client_id: body.client_id,
        bank: body.bank,
        number: body.number,
        amount: body.amount,
        issue_date: body.issue_date,
        due_date: body.due_date,
        holder: body.holder,
        holder_cuit: body.holder_cuit,
        status: 'in_portfolio',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando cheque:', error);
    return NextResponse.json(
      { error: 'Error al crear cheque' },
      { status: 500 }
    );
  }
}
