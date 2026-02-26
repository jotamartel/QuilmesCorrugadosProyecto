/**
 * API: /api/boxes/export-csv
 * GET - Exporta todas las cajas del catálogo como CSV
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: boxes, error } = await supabase
      .from('boxes')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching boxes for CSV:', error);
      return NextResponse.json({ error: 'Error al obtener cajas' }, { status: 500 });
    }

    // Build CSV
    const headers = ['nombre', 'largo_mm', 'ancho_mm', 'alto_mm', 'estandar', 'stock'];
    const rows = (boxes || []).map((box) => [
      // Escape commas and quotes in name
      `"${(box.name || '').replace(/"/g, '""')}"`,
      box.length_mm,
      box.width_mm,
      box.height_mm,
      box.is_standard ? 'true' : 'false',
      box.stock ?? 0,
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=catalogo-cajas.csv',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/boxes/export-csv:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
