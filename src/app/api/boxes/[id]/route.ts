/**
 * API: /api/boxes/:id
 * PATCH - Actualizar campos de una caja (stock, nombre, flags)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface PatchBody {
  name?: string;
  stock?: number;
  is_standard?: boolean;
  is_active?: boolean;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const body: PatchBody = await request.json();

    // Build update object with only allowed fields
    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'El nombre no puede estar vacio' }, { status: 400 });
      }
      update.name = body.name.trim();
    }

    if (body.stock !== undefined) {
      if (typeof body.stock !== 'number' || body.stock < 0 || !Number.isInteger(body.stock)) {
        return NextResponse.json({ error: 'El stock debe ser un entero >= 0' }, { status: 400 });
      }
      update.stock = body.stock;
    }

    if (body.is_standard !== undefined) {
      update.is_standard = Boolean(body.is_standard);
    }

    if (body.is_active !== undefined) {
      update.is_active = Boolean(body.is_active);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos para actualizar' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('boxes')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating box:', error);
      return NextResponse.json({ error: 'Error al actualizar la caja' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in PATCH /api/boxes/:id:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
