/**
 * API: /api/costs/fixed
 * Gestión de costos fijos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const activeOnly = searchParams.get('active') !== 'false';

    let query = supabase
      .from('fixed_costs')
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

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/costs/fixed:', error);
    return NextResponse.json(
      { error: 'Error al obtener costos fijos' },
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
      amount,
      frequency = 'monthly',
      start_date,
      end_date,
      notes,
    } = body;

    if (!name || !amount || !start_date) {
      return NextResponse.json(
        { error: 'Nombre, monto y fecha de inicio son requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('fixed_costs')
      .insert({
        category_id,
        name,
        description,
        amount,
        frequency,
        start_date,
        end_date,
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
    console.error('Error in POST /api/costs/fixed:', error);
    return NextResponse.json(
      { error: 'Error al crear costo fijo' },
      { status: 500 }
    );
  }
}
