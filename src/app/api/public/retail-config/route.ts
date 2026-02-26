/**
 * API Publica: /api/public/retail-config
 * GET - Devuelve el precio minorista por m2 configurado en el dashboard.
 * Usado por el retail para calcular precios dinamicamente.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('pricing_config')
      .select('price_per_m2_retail, price_per_m2_standard, price_per_m2_volume, volume_threshold_m2')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // Si no hay config, devolver defaults
      return NextResponse.json({
        price_per_m2_retail: 900,
        price_per_m2_wholesale: 700,
      });
    }

    return NextResponse.json({
      price_per_m2_retail: data.price_per_m2_retail ?? 900,
      price_per_m2_wholesale: data.price_per_m2_standard ?? 700,
    });
  } catch (error) {
    console.error('Error in GET /api/public/retail-config:', error);
    return NextResponse.json({
      price_per_m2_retail: 900,
      price_per_m2_wholesale: 700,
    });
  }
}
