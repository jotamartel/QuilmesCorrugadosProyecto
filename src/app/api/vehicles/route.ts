import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateVehicleRequest } from '@/lib/types/database';

// GET /api/vehicles - Listar vehículos
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const activeOnly = searchParams.get('active') === 'true';

    let query = supabase
      .from('vehicles')
      .select('*')
      .order('patent', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error listando vehículos:', error);
    return NextResponse.json(
      { error: 'Error al listar vehículos' },
      { status: 500 }
    );
  }
}

// POST /api/vehicles - Crear vehículo
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body: CreateVehicleRequest = await request.json();

    if (!body.patent) {
      return NextResponse.json(
        { error: 'La patente es requerida' },
        { status: 400 }
      );
    }

    // Verificar que la patente no exista
    const { data: existing } = await supabase
      .from('vehicles')
      .select('id')
      .eq('patent', body.patent.toUpperCase())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un vehículo con esa patente' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        patent: body.patent.toUpperCase(),
        description: body.description,
        driver_name: body.driver_name,
        driver_cuit: body.driver_cuit,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error creando vehículo:', error);
    return NextResponse.json(
      { error: 'Error al crear vehículo' },
      { status: 500 }
    );
  }
}
