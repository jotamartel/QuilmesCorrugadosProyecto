/**
 * API: /api/costs/supplies/[id]
 * Gestión individual de insumos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('supplies')
      .select(`
        *,
        category:cost_categories(id, name, type)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Insumo no encontrado' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/costs/supplies/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener insumo' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('supplies')
      .update(body)
      .eq('id', id)
      .select(`
        *,
        category:cost_categories(id, name, type)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/costs/supplies/[id]:', error);
    return NextResponse.json(
      { error: 'Error al actualizar insumo' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('supplies')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/costs/supplies/[id]:', error);
    return NextResponse.json(
      { error: 'Error al eliminar insumo' },
      { status: 500 }
    );
  }
}
