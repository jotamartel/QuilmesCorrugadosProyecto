/**
 * API Pública: /api/public/cities/partidos
 * GET - Obtiene lista única de partidos de Buenos Aires
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: partidos, error } = await supabase
      .from('buenos_aires_cities')
      .select('partido')
      .order('partido');

    if (error) {
      console.error('Error fetching partidos:', error);
      return NextResponse.json(
        { error: 'Error al obtener partidos' },
        { status: 500 }
      );
    }

    // Obtener valores únicos
    const uniquePartidos = [...new Set(partidos?.map(p => p.partido).filter(Boolean))];

    return NextResponse.json({
      partidos: uniquePartidos
    });

  } catch (error) {
    console.error('Error in GET /api/public/cities/partidos:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
