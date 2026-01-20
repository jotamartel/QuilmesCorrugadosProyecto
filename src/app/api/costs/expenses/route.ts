/**
 * API: /api/costs/expenses
 * Gestión de gastos operativos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseISO, startOfMonth, endOfMonth } from 'date-fns';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const categoryId = searchParams.get('category_id');

    // Por defecto, mes actual
    const endDate = to ? parseISO(to) : endOfMonth(new Date());
    const startDate = from ? parseISO(from) : startOfMonth(new Date());

    let query = supabase
      .from('operational_expenses')
      .select(`
        *,
        category:cost_categories(id, name, type)
      `)
      .gte('expense_date', startDate.toISOString().split('T')[0])
      .lte('expense_date', endDate.toISOString().split('T')[0])
      .order('expense_date', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calcular totales
    const total = data?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
    const byCategory = data?.reduce((acc, exp) => {
      const catName = exp.category?.name || 'Sin categoría';
      acc[catName] = (acc[catName] || 0) + Number(exp.amount);
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      data,
      summary: {
        total,
        by_category: byCategory,
        count: data?.length || 0,
        period: {
          from: startDate.toISOString().split('T')[0],
          to: endDate.toISOString().split('T')[0],
        },
      },
    });
  } catch (error) {
    console.error('Error in GET /api/costs/expenses:', error);
    return NextResponse.json(
      { error: 'Error al obtener gastos operativos' },
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
      concept,
      amount,
      expense_date,
      payment_method,
      receipt_number,
      supplier,
      notes,
    } = body;

    if (!concept || !amount || !expense_date) {
      return NextResponse.json(
        { error: 'Concepto, monto y fecha son requeridos' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('operational_expenses')
      .insert({
        category_id,
        concept,
        amount,
        expense_date,
        payment_method,
        receipt_number,
        supplier,
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
    console.error('Error in POST /api/costs/expenses:', error);
    return NextResponse.json(
      { error: 'Error al crear gasto operativo' },
      { status: 500 }
    );
  }
}
