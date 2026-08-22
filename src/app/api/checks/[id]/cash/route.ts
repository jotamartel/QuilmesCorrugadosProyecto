import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * `checks` tiene RLS prendido y cero policies: con el cliente de sesión el
 * SELECT devolvía "cheque no encontrado" aunque existiera, y el UPDATE
 * contestaba ok sin escribir. Se comprueba quién pide y se opera con la service
 * role.
 */
async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/checks/[id]/cash - Cobrar cheque en efectivo
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Antes no chequeaba sesión: no se notaba porque RLS bloqueaba la escritura.
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { notes } = body;

    // Verificar que el cheque esté en cartera
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select('status')
      .eq('id', id)
      .single();

    if (checkError || !check) {
      return NextResponse.json(
        { error: 'Cheque no encontrado' },
        { status: 404 }
      );
    }

    if (check.status !== 'in_portfolio') {
      return NextResponse.json(
        { error: 'El cheque no está en cartera' },
        { status: 400 }
      );
    }

    // Actualizar cheque
    const { data, error } = await supabase
      .from('checks')
      .update({
        status: 'cashed',
        exit_type: 'cash',
        exit_date: new Date().toISOString(),
        exit_notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error cobrando cheque:', error);
    return NextResponse.json(
      { error: 'Error al cobrar cheque' },
      { status: 500 }
    );
  }
}
