/**
 * API: /api/quotes/[id]/design
 * POST - Guarda el diseño de impresión de una cotización
 * GET - Obtiene el diseño de impresión de una cotización
 * DELETE - Elimina el diseño de impresión de una cotización
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/quotes/[id]/design
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: design, error } = await supabase
      .from('printing_designs')
      .select('*')
      .eq('quote_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(null);
      }
      throw error;
    }

    return NextResponse.json(design);
  } catch (error) {
    console.error('Error in GET /api/quotes/[id]/design:', error);
    return NextResponse.json(
      { error: 'Error al obtener el diseño' },
      { status: 500 }
    );
  }
}

// POST /api/quotes/[id]/design
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    // Verificar que la cotización existe
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, client_id, printing_colors')
      .eq('id', id)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Verificar si ya existe un diseño para esta cotización
    const { data: existingDesign } = await supabase
      .from('printing_designs')
      .select('id')
      .eq('quote_id', id)
      .single();

    if (existingDesign) {
      // Actualizar el diseño existente
      const { data: design, error } = await supabase
        .from('printing_designs')
        .update({
          name: body.name,
          file_url: body.file_url,
          file_type: body.file_type,
          colors: body.colors || quote.printing_colors,
          notes: body.notes,
        })
        .eq('id', existingDesign.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json(design);
    }

    // Crear nuevo diseño
    const { data: design, error } = await supabase
      .from('printing_designs')
      .insert({
        quote_id: id,
        client_id: quote.client_id,
        name: body.name,
        file_url: body.file_url,
        file_type: body.file_type,
        colors: body.colors || quote.printing_colors,
        status: 'pending',
        notes: body.notes,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(design, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/quotes/[id]/design:', error);
    return NextResponse.json(
      { error: 'Error al guardar el diseño' },
      { status: 500 }
    );
  }
}

// DELETE /api/quotes/[id]/design
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Obtener el diseño para borrar el archivo de storage
    const { data: design } = await supabase
      .from('printing_designs')
      .select('file_url')
      .eq('quote_id', id)
      .single();

    if (design?.file_url) {
      // Extraer el path del archivo de la URL
      const url = new URL(design.file_url);
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/quilmes-files\/(.*)/);
      if (pathMatch) {
        await supabase.storage
          .from('quilmes-files')
          .remove([pathMatch[1]]);
      }
    }

    // Eliminar el registro de diseño
    const { error } = await supabase
      .from('printing_designs')
      .delete()
      .eq('quote_id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/quotes/[id]/design:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el diseño' },
      { status: 500 }
    );
  }
}
