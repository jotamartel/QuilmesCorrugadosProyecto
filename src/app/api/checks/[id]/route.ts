import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * `checks` y `clients` tienen RLS prendido y cero policies: con el cliente de
 * sesión el GET devolvía "no encontrado" para cheques que existen y el PATCH
 * contestaba ok sin cambiar filas. Se comprueba la sesión y se opera con la
 * service role, que saltea RLS.
 */
async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/checks/[id] - Obtener cheque por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('checks')
      .select(`
        *,
        client:clients(name, company, cuit),
        payment:payments(order_id, type)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Cheque no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error obteniendo cheque:', error);
    return NextResponse.json(
      { error: 'Error al obtener cheque' },
      { status: 500 }
    );
  }
}

// PATCH /api/checks/[id] - Actualizar cheque
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Antes no comprobaba sesión: no se notaba porque RLS igual bloqueaba la
    // escritura y el endpoint contestaba ok sin haber cambiado nada.
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('checks')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Cheque no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando cheque:', error);
    return NextResponse.json(
      { error: 'Error al actualizar cheque' },
      { status: 500 }
    );
  }
}
