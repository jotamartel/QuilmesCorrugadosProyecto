/**
 * API: /api/quotes/[id]
 * GET - Obtiene detalle de una cotización
 * PATCH - Actualiza una cotización
 * DELETE - Elimina una cotización
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/quotes/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: quote, error } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        items:quote_items(
          *,
          box:boxes(id, name)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Cotización no encontrada' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(quote);
  } catch (error) {
    console.error('Error in GET /api/quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error al obtener la cotización' },
      { status: 500 }
    );
  }
}

// PATCH /api/quotes/[id]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Verificar que la cotización existe
    const { data: existing, error: existingError } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Si hay items, es una edición completa (solo permitida en draft)
    if (body.items && Array.isArray(body.items)) {
      if (existing.status !== 'draft') {
        return NextResponse.json(
          { error: 'Solo se pueden editar cotizaciones en estado Borrador' },
          { status: 400 }
        );
      }

      // Importar funciones de cálculo
      const { calculateUnfolded, isOversized } = await import('@/lib/utils/box-calculations');

      // Calcular items
      const calculatedItems = body.items.map((item: {
        length_mm: number;
        width_mm: number;
        height_mm: number;
        quantity: number;
        box_id?: string;
      }) => {
        const unfolded = calculateUnfolded(item.length_mm, item.width_mm, item.height_mm);
        const m2PerBox = unfolded.m2;
        const totalM2 = m2PerBox * item.quantity;

        return {
          box_id: item.box_id || null,
          length_mm: item.length_mm,
          width_mm: item.width_mm,
          height_mm: item.height_mm,
          unfolded_length_mm: unfolded.unfoldedLength,
          unfolded_width_mm: unfolded.unfoldedWidth,
          m2_per_box: m2PerBox,
          quantity: item.quantity,
          total_m2: totalM2,
          is_custom: !item.box_id,
          is_oversized: isOversized(item.length_mm, item.width_mm, item.height_mm),
        };
      });

      // Eliminar items existentes
      await supabase
        .from('quote_items')
        .delete()
        .eq('quote_id', id);

      // Insertar nuevos items
      const itemsToInsert = calculatedItems.map((item: Record<string, unknown>) => ({
        ...item,
        quote_id: id,
      }));

      const { error: itemsError } = await supabase
        .from('quote_items')
        .insert(itemsToInsert);

      if (itemsError) {
        throw itemsError;
      }

      // Calcular validez
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 7);

      // Calcular fecha de entrega estimada
      const productionDays = body.production_days || (body.has_printing ? 14 : 7);
      const estimatedDelivery = new Date();
      let daysAdded = 0;
      while (daysAdded < productionDays) {
        estimatedDelivery.setDate(estimatedDelivery.getDate() + 1);
        const dayOfWeek = estimatedDelivery.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          daysAdded++;
        }
      }

      // Actualizar cotización con todos los campos
      const updateData: Record<string, unknown> = {
        client_id: body.client_id || null,
        total_m2: body.total_m2,
        price_per_m2: body.price_per_m2,
        subtotal: body.subtotal,
        has_printing: body.has_printing,
        printing_colors: body.printing_colors || 0,
        printing_cost: body.printing_cost || 0,
        has_existing_polymer: body.has_existing_polymer || false,
        has_die_cut: body.has_die_cut || false,
        die_cut_cost: body.die_cut_cost || 0,
        shipping_cost: body.shipping_cost || 0,
        shipping_notes: body.shipping_notes || null,
        total: body.total,
        production_days: productionDays,
        estimated_delivery: estimatedDelivery.toISOString().split('T')[0],
        valid_until: validUntilDate.toISOString().split('T')[0],
        notes: body.notes || null,
      };

      const { data: quote, error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          client:clients(id, name, company),
          items:quote_items(*)
        `)
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json(quote);
    }

    // Actualización simple (sin items)
    const allowedFields = [
      'status',
      'notes',
      'internal_notes',
      'has_printing',
      'printing_colors',
      'printing_cost',
      'has_existing_polymer',
      'has_die_cut',
      'die_cut_cost',
      'shipping_cost',
      'shipping_notes',
    ];

    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Recalcular total si cambian los costos
    if (
      body.printing_cost !== undefined ||
      body.die_cut_cost !== undefined ||
      body.shipping_cost !== undefined
    ) {
      const { data: quoteData } = await supabase
        .from('quotes')
        .select('subtotal, printing_cost, die_cut_cost, shipping_cost')
        .eq('id', id)
        .single();

      if (quoteData) {
        const subtotal = quoteData.subtotal;
        const printingCost = body.printing_cost ?? quoteData.printing_cost;
        const dieCutCost = body.die_cut_cost ?? quoteData.die_cut_cost;
        const shippingCost = body.shipping_cost ?? quoteData.shipping_cost;

        updateData.total = subtotal + printingCost + dieCutCost + shippingCost;
      }
    }

    // Actualizar timestamps según estado
    if (body.status === 'sent' && existing.status === 'draft') {
      updateData.sent_at = new Date().toISOString();
    } else if (body.status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    } else if (body.status === 'expired') {
      updateData.expired_at = new Date().toISOString();
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, company),
        items:quote_items(*)
      `)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(quote);
  } catch (error) {
    console.error('Error in PATCH /api/quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la cotización' },
      { status: 500 }
    );
  }
}

// DELETE /api/quotes/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Verificar que la cotización existe y no está convertida
    const { data: existing, error: existingError } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    if (existing.status === 'converted') {
      return NextResponse.json(
        { error: 'No se puede eliminar una cotización convertida en orden' },
        { status: 400 }
      );
    }

    // Eliminar cotización (los items se eliminan en cascada)
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/quotes/[id]:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la cotización' },
      { status: 500 }
    );
  }
}
