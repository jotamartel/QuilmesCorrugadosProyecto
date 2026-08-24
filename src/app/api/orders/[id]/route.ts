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
    const camposDeTexto = [
      'delivery_address',
      'delivery_city',
      'delivery_notes',
      // La franja horaria va en texto libre porque asi se acuerda por
      // WhatsApp: "manana", "15 a 17hs", "antes del mediodia". Imponer un enum
      // obligaria a mapear cada frase que dice un cliente.
      'delivery_time_window',
    ];

    // LA FECHA DE ENTREGA AHORA SE EDITA, Y ESO ERA MEDIA ETAPA.
    //
    // La calculaba el cotizador al crear la orden y despues no la tocaba
    // nadie: si el cliente pedia otra fecha, o la maquina se atrasaba, el
    // sistema seguia mostrando la primera. Tres de las siete ordenes vivas la
    // tenian directamente en null.
    //
    // Son DOS fechas distintas y por eso son dos columnas:
    //   estimated_delivery      la promesa al cliente, se fija al confirmar
    //   scheduled_delivery_date el dia acordado para el flete, cuando ya esta
    //                           lista y cobrada
    const camposDeFecha = ['estimated_delivery', 'scheduled_delivery_date'];

    const updateData: Record<string, unknown> = {};

    for (const field of camposDeTexto) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]?.trim() || null;
      }
    }

    for (const field of camposDeFecha) {
      if (body[field] === undefined) continue;
      const valor = String(body[field] ?? '').trim();
      if (!valor) {
        updateData[field] = null;
        continue;
      }
      // Una fecha invalida guardada es peor que un 400: se muestra rota en el
      // panel y se le anuncia rota al cliente. No se valida el RANGO a
      // proposito —una fecha pasada sirve para regularizar un pedido viejo.
      const fecha = new Date(valor);
      if (Number.isNaN(fecha.getTime())) {
        return NextResponse.json(
          { error: `La fecha "${valor}" no es valida` },
          { status: 400 },
        );
      }
      updateData[field] = valor;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay nada para actualizar' }, { status: 400 });
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
