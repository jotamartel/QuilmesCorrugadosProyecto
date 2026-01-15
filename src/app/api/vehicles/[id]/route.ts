import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/vehicles/[id] - Obtener vehículo por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error obteniendo vehículo:', error);
    return NextResponse.json(
      { error: 'Error al obtener vehículo' },
      { status: 500 }
    );
  }
}

// PATCH /api/vehicles/[id] - Actualizar vehículo
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    // Si se actualiza la patente, verificar que no exista
    if (body.patent) {
      const { data: existing } = await supabase
        .from('vehicles')
        .select('id')
        .eq('patent', body.patent.toUpperCase())
        .neq('id', id)
        .single();

      if (existing) {
        return NextResponse.json(
          { error: 'Ya existe un vehículo con esa patente' },
          { status: 400 }
        );
      }

      body.patent = body.patent.toUpperCase();
    }

    const { data, error } = await supabase
      .from('vehicles')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error actualizando vehículo:', error);
    return NextResponse.json(
      { error: 'Error al actualizar vehículo' },
      { status: 500 }
    );
  }
}

// DELETE /api/vehicles/[id] - Eliminar vehículo (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Soft delete: marcar como inactivo
    const { error } = await supabase
      .from('vehicles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ message: 'Vehículo eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando vehículo:', error);
    return NextResponse.json(
      { error: 'Error al eliminar vehículo' },
      { status: 500 }
    );
  }
}
