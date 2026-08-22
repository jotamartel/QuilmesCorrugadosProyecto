import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * `payments` y `checks` tienen RLS prendido y cero policies: con el cliente de
 * sesión el GET devolvía 404 fantasma y el PATCH/DELETE contestaban ok sin
 * haber tocado una fila. Chequeamos sesión con `createClient` y operamos con la
 * service role, que saltea RLS.
 */
async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET /api/payments/[id] - Obtener pago por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        order:orders(order_number, total),
        client:clients(name, company, cuit)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Pago no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error obteniendo pago:', error);
    return NextResponse.json(
      { error: 'Error al obtener pago' },
      { status: 500 }
    );
  }
}

// PATCH /api/payments/[id] - Actualizar pago
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Antes no chequeaba sesión. No se notó porque RLS bloqueaba el update
    // igual: contestaba con el pago actualizado... que nunca se actualizó.
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('payments')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Pago no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando pago:', error);
    return NextResponse.json(
      { error: 'Error al actualizar pago' },
      { status: 500 }
    );
  }
}

// DELETE /api/payments/[id] - Cancelar pago
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Antes no chequeaba sesión y encima el "borrado" no borraba nada por RLS.
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();

    // Soft delete: marcar como cancelado
    const { error } = await supabase
      .from('payments')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      throw error;
    }

    // También cancelar cheque asociado si existe
    await supabase
      .from('checks')
      .update({ status: 'rejected' })
      .eq('payment_id', id);

    return NextResponse.json({ message: 'Pago cancelado correctamente' });
  } catch (error) {
    console.error('Error cancelando pago:', error);
    return NextResponse.json(
      { error: 'Error al cancelar pago' },
      { status: 500 }
    );
  }
}
