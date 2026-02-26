/**
 * API Pública: /api/public/standard-suggestions
 * GET - Devuelve las 2 cajas estándar más cercanas en tamaño a las dimensiones dadas.
 * Usado en el retail para sugerir cajas de stock cuando el pedido es < 1000 m².
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const l = parseInt(searchParams.get('l') || '0');
    const w = parseInt(searchParams.get('w') || '0');
    const h = parseInt(searchParams.get('h') || '0');

    if (!l || !w || !h) {
      return NextResponse.json({ error: 'Parametros l, w, h son requeridos' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch all active standard boxes with stock > 0
    const { data: boxes, error } = await supabase
      .from('boxes')
      .select('id, name, length_mm, width_mm, height_mm, m2_per_box, stock')
      .eq('is_standard', true)
      .eq('is_active', true)
      .gt('stock', 0);

    if (error) {
      console.error('Error fetching standard boxes:', error);
      return NextResponse.json({ error: 'Error al obtener cajas' }, { status: 500 });
    }

    if (!boxes || boxes.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Filter out exact match (user already has those dimensions)
    const candidates = boxes.filter(
      (box) => !(box.length_mm === l && box.width_mm === w && box.height_mm === h)
    );

    // Sort by Manhattan distance in dimensions (|L1-L2| + |W1-W2| + |H1-H2|)
    const sorted = candidates
      .map((box) => ({
        ...box,
        distance: Math.abs(box.length_mm - l) + Math.abs(box.width_mm - w) + Math.abs(box.height_mm - h),
      }))
      .sort((a, b) => a.distance - b.distance);

    // Return top 2
    const suggestions = sorted.slice(0, 2).map(({ distance: _distance, ...box }) => box);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error in GET /api/public/standard-suggestions:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
