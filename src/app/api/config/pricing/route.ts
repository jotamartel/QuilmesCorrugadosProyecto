/**
 * API: /api/config/pricing
 * GET - Obtiene configuración de precios activa
 * POST - Crea nueva configuración (para actualización mensual)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/config/pricing - Obtener configuración activa
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'No hay configuración de precios activa' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/config/pricing:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de precios' },
      { status: 500 }
    );
  }
}

// POST /api/config/pricing - Crear nueva configuración
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Validar campos numéricos
    const numericFields = [
      'price_per_m2_standard',
      'price_per_m2_volume',
      'volume_threshold_m2',
      'min_m2_per_model',
      'price_per_m2_below_minimum',
      'free_shipping_min_m2',
      'free_shipping_max_km',
      'production_days_standard',
      'production_days_printing',
      'quote_validity_days',
    ];

    for (const field of numericFields) {
      if (body[field] !== undefined && (typeof body[field] !== 'number' || body[field] < 0)) {
        return NextResponse.json(
          { error: `${field} debe ser un número positivo` },
          { status: 400 }
        );
      }
    }

    // Desactivar configuración anterior
    await supabase
      .from('pricing_config')
      .update({
        is_active: false,
        valid_until: new Date().toISOString().split('T')[0],
      })
      .eq('is_active', true);

    // Crear nueva configuración
    const { data: config, error } = await supabase
      .from('pricing_config')
      .insert({
        price_per_m2_standard: body.price_per_m2_standard ?? 700,
        price_per_m2_volume: body.price_per_m2_volume ?? 670,
        volume_threshold_m2: body.volume_threshold_m2 ?? 5000,
        min_m2_per_model: body.min_m2_per_model ?? 3000,
        price_per_m2_below_minimum: body.price_per_m2_below_minimum ?? (body.price_per_m2_standard ?? 700) * 1.20,
        free_shipping_min_m2: body.free_shipping_min_m2 ?? 4000,
        free_shipping_max_km: body.free_shipping_max_km ?? 60,
        production_days_standard: body.production_days_standard ?? 7,
        production_days_printing: body.production_days_printing ?? 14,
        quote_validity_days: body.quote_validity_days ?? 7,
        valid_from: body.valid_from || new Date().toISOString().split('T')[0],
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pricing config:', error);
      return NextResponse.json(
        { error: 'Error al crear configuración de precios' },
        { status: 500 }
      );
    }

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/config/pricing:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
