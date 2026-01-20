/**
 * API: /api/costs/categories
 * Gestión de categorías de costos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('cost_categories')
      .select('*')
      .order('type')
      .order('name');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/costs/categories:', error);
    return NextResponse.json(
      { error: 'Error al obtener categorías de costos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const { name, type, description } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Nombre y tipo son requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('cost_categories')
      .insert({
        name,
        type,
        description,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/costs/categories:', error);
    return NextResponse.json(
      { error: 'Error al crear categoría de costos' },
      { status: 500 }
    );
  }
}
