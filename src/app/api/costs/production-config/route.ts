/**
 * API: /api/costs/production-config
 * Configuración de costos de producción por m2
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Obtener configuración activa
    const { data, error } = await supabase
      .from('production_cost_config')
      .select('*')
      .eq('is_active', true)
      .is('effective_to', null)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return NextResponse.json({
        id: null,
        cardboard_cost_per_m2: 0,
        glue_cost_per_m2: 0,
        ink_cost_per_m2: 0,
        labor_cost_per_m2: 0,
        energy_cost_per_m2: 0,
        waste_percentage: 5,
        overhead_percentage: 10,
        total_cost_per_m2: 0,
      });
    }

    // Calcular costo total por m2
    const baseCost =
      Number(data.cardboard_cost_per_m2) +
      Number(data.glue_cost_per_m2) +
      Number(data.ink_cost_per_m2) +
      Number(data.labor_cost_per_m2) +
      Number(data.energy_cost_per_m2);

    const wasteAdjustment = baseCost * (Number(data.waste_percentage) / 100);
    const overheadAdjustment = baseCost * (Number(data.overhead_percentage) / 100);
    const totalCostPerM2 = baseCost + wasteAdjustment + overheadAdjustment;

    return NextResponse.json({
      ...data,
      total_cost_per_m2: Math.round(totalCostPerM2 * 100) / 100,
    });
  } catch (error) {
    console.error('Error in GET /api/costs/production-config:', error);
    return NextResponse.json(
      { error: 'Error al obtener configuración de costos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();

    const {
      cardboard_cost_per_m2,
      glue_cost_per_m2,
      ink_cost_per_m2,
      labor_cost_per_m2,
      energy_cost_per_m2,
      waste_percentage,
      overhead_percentage,
      notes,
    } = body;

    // Desactivar configuración anterior
    await supabase
      .from('production_cost_config')
      .update({
        is_active: false,
        effective_to: new Date().toISOString().split('T')[0],
      })
      .eq('is_active', true);

    // Crear nueva configuración
    const { data, error } = await supabase
      .from('production_cost_config')
      .insert({
        name: `Configuración ${new Date().toLocaleDateString('es-AR')}`,
        cardboard_cost_per_m2: cardboard_cost_per_m2 || 0,
        glue_cost_per_m2: glue_cost_per_m2 || 0,
        ink_cost_per_m2: ink_cost_per_m2 || 0,
        labor_cost_per_m2: labor_cost_per_m2 || 0,
        energy_cost_per_m2: energy_cost_per_m2 || 0,
        waste_percentage: waste_percentage || 5,
        overhead_percentage: overhead_percentage || 10,
        effective_from: new Date().toISOString().split('T')[0],
        notes,
      })
      .select()
      .single();

    if (error) throw error;

    // Calcular costo total
    const baseCost =
      Number(data.cardboard_cost_per_m2) +
      Number(data.glue_cost_per_m2) +
      Number(data.ink_cost_per_m2) +
      Number(data.labor_cost_per_m2) +
      Number(data.energy_cost_per_m2);

    const wasteAdjustment = baseCost * (Number(data.waste_percentage) / 100);
    const overheadAdjustment = baseCost * (Number(data.overhead_percentage) / 100);
    const totalCostPerM2 = baseCost + wasteAdjustment + overheadAdjustment;

    return NextResponse.json({
      ...data,
      total_cost_per_m2: Math.round(totalCostPerM2 * 100) / 100,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/costs/production-config:', error);
    return NextResponse.json(
      { error: 'Error al guardar configuración de costos' },
      { status: 500 }
    );
  }
}
