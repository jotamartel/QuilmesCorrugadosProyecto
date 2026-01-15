/**
 * API: /api/boxes
 * GET - Lista cajas del catálogo
 * POST - Agrega nueva caja al catálogo
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  calculateUnfolded,
  isOversized,
  isUndersized,
} from '@/lib/utils/box-calculations';

// GET /api/boxes - Lista cajas
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros
    const onlyStandard = searchParams.get('standard') === 'true';
    const onlyActive = searchParams.get('active') !== 'false'; // por defecto true

    // Construir query
    let query = supabase
      .from('boxes')
      .select('*')
      .order('m2_per_box', { ascending: true });

    if (onlyStandard) {
      query = query.eq('is_standard', true);
    }

    if (onlyActive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching boxes:', error);
      return NextResponse.json(
        { error: 'Error al obtener cajas' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /api/boxes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/boxes - Crear caja
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Validar campos requeridos
    const { name, length_mm, width_mm, height_mm } = body;

    if (!name || !length_mm || !width_mm || !height_mm) {
      return NextResponse.json(
        { error: 'Nombre, largo, ancho y alto son requeridos' },
        { status: 400 }
      );
    }

    // Validar que sean números enteros positivos
    if (!Number.isInteger(length_mm) || !Number.isInteger(width_mm) || !Number.isInteger(height_mm)) {
      return NextResponse.json(
        { error: 'Las medidas deben ser números enteros en mm' },
        { status: 400 }
      );
    }

    // Validar tamaño mínimo
    if (isUndersized(length_mm, width_mm, height_mm)) {
      return NextResponse.json(
        { error: 'La caja es menor al tamaño mínimo permitido (200x200x100 mm)' },
        { status: 400 }
      );
    }

    // Calcular medidas desplegadas
    const { unfoldedWidth, unfoldedLength, m2 } = calculateUnfolded(
      length_mm,
      width_mm,
      height_mm
    );

    // Verificar si ya existe una caja con las mismas dimensiones
    const { data: existing } = await supabase
      .from('boxes')
      .select('id')
      .eq('length_mm', length_mm)
      .eq('width_mm', width_mm)
      .eq('height_mm', height_mm)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe una caja con esas dimensiones' },
        { status: 400 }
      );
    }

    // Crear caja
    const { data: box, error } = await supabase
      .from('boxes')
      .insert({
        name: name.trim(),
        length_mm,
        width_mm,
        height_mm,
        unfolded_length_mm: unfoldedLength,
        unfolded_width_mm: unfoldedWidth,
        m2_per_box: m2,
        is_standard: body.is_standard ?? true,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating box:', error);
      return NextResponse.json(
        { error: 'Error al crear la caja' },
        { status: 500 }
      );
    }

    // Agregar información adicional a la respuesta
    const response = {
      ...box,
      is_oversized: isOversized(length_mm, width_mm, height_mm),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/boxes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
