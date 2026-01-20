/**
 * API: /api/costs/supplies
 * Gestión de insumos y materiales
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const activeOnly = searchParams.get('active') !== 'false';
    const lowStock = searchParams.get('low_stock') === 'true';

    let query = supabase
      .from('supplies')
      .select(`
        *,
        category:cost_categories(id, name, type)
      `)
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Filtrar por stock bajo si se solicita
    let result = data;
    if (lowStock) {
      result = data?.filter(s => s.current_stock <= s.min_stock) || [];
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/costs/supplies:', error);
    return NextResponse.json(
      { error: 'Error al obtener insumos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const {
      category_id,
      name,
      description,
      unit,
      current_price,
      supplier,
      min_stock = 0,
      current_stock = 0,
      notes,
    } = body;

    if (!name || !unit || current_price === undefined) {
      return NextResponse.json(
        { error: 'Nombre, unidad y precio son requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('supplies')
      .insert({
        category_id,
        name,
        description,
        unit,
        current_price,
        supplier,
        min_stock,
        current_stock,
        notes,
      })
      .select(`
        *,
        category:cost_categories(id, name, type)
      `)
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/costs/supplies:', error);
    return NextResponse.json(
      { error: 'Error al crear insumo' },
      { status: 500 }
    );
  }
}
