/**
 * API Publica: /api/public/standard-boxes
 * GET - Devuelve TODAS las cajas estandar activas ordenadas por tamaño (m2) de menor a mayor.
 * Usado en el retail para mostrar el catalogo completo cuando el usuario quiere "ver todas las medidas".
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: boxes, error } = await supabase
      .from('boxes')
      .select('id, name, length_mm, width_mm, height_mm, m2_per_box, stock')
      .eq('is_standard', true)
      .eq('is_active', true)
      .order('m2_per_box', { ascending: true });

    if (error) {
      console.error('Error fetching standard boxes:', error);
      return NextResponse.json({ error: 'Error al obtener cajas' }, { status: 500 });
    }

    return NextResponse.json({ boxes: boxes || [] });
  } catch (error) {
    console.error('Error in GET /api/public/standard-boxes:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
