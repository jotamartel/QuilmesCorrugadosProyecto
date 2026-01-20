/**
 * API Pública: /api/public/cities
 * GET - Obtiene ciudades de Buenos Aires con distancias
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search');
    const partido = searchParams.get('partido');
    const freeShippingOnly = searchParams.get('free_shipping') === 'true';

    let query = supabase
      .from('buenos_aires_cities')
      .select('id, name, partido, distance_km, is_free_shipping, postal_codes')
      .order('name');

    // Filtro por búsqueda de nombre
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Filtro por partido
    if (partido) {
      query = query.eq('partido', partido);
    }

    // Solo ciudades con envío gratis
    if (freeShippingOnly) {
      query = query.eq('is_free_shipping', true);
    }

    const { data: cities, error } = await query;

    if (error) {
      console.error('Error fetching cities:', error);
      return NextResponse.json(
        { error: 'Error al obtener ciudades' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      cities: cities || [],
      total: cities?.length || 0
    });

  } catch (error) {
    console.error('Error in GET /api/public/cities:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
