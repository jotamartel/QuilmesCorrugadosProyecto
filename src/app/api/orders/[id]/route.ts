/**
 * API: /api/orders/[id]
 * GET - Obtiene detalle de una orden
 * PATCH - Actualiza una orden
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        client:clients(*),
        quote:quotes(id, quote_number, has_printing, printing_colors, has_die_cut),
        items:order_items(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Orden no encontrada' },
          { status: 404 }
        );
      }
      throw error;
    }

    // Obtener comunicaciones relacionadas
    const { data: communications } = await supabase
      .from('communications')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      ...order,
      communications: communications || [],
    });
  } catch (error) {
    console.error('Error in GET /api/orders/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener la orden' },
      { status: 500 }
    );
  }
}

// PATCH /api/orders/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Verificar que la orden existe
    const { data: existing, error: existingError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    // Campos permitidos para actualizar (no status, eso tiene su propio endpoint)
    const allowedFields = [
      'delivery_address',
      'delivery_city',
      'delivery_notes',
    ];

    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]?.trim() || null;
      }
    }

    const { data: order, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, company),
        quote:quotes(id, quote_number)
      `)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error in PATCH /api/orders/[id]:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la orden' },
      { status: 500 }
    );
  }
}
