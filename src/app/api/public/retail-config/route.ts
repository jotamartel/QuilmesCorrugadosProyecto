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
      .select('price_per_m2_retail, price_per_m2_below_minimum, wholesale_min_m2, min_m2_pedido')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    // Respaldos alineados con la base, para no cotizar un precio viejo si falla.
    const DEFAULTS = {
      price_per_m2_retail: 1200,
      price_per_m2_wholesale: 1000,
      wholesale_min_m2: 1000,
      min_m2_pedido: 500,
    };

    if (error) {
      console.error('Error leyendo pricing_config, se usan respaldos:', error);
      return NextResponse.json(DEFAULTS);
    }

    return NextResponse.json({
      // Precio de stock: el unico que cobra /cajas.
      price_per_m2_retail: Number(data.price_per_m2_retail) || DEFAULTS.price_per_m2_retail,
      // A cuanto sale el m2 apenas pasa al mayorista. Solo para el mensaje de
      // derivacion: /cajas no cotiza a este precio.
      price_per_m2_wholesale: Number(data.price_per_m2_below_minimum) || DEFAULTS.price_per_m2_wholesale,
      // Tope del canal de stock.
      wholesale_min_m2: Number(data.wholesale_min_m2) || DEFAULTS.wholesale_min_m2,
      // Piso de venta: por debajo de esto no se cotiza en ningun canal.
      min_m2_pedido: Number(data.min_m2_pedido) || DEFAULTS.min_m2_pedido,
    });
  } catch (error) {
    console.error('Error in GET /api/public/retail-config:', error);
    return NextResponse.json({
      price_per_m2_retail: 1200,
      price_per_m2_wholesale: 1000,
      wholesale_min_m2: 1000,
      min_m2_pedido: 500,
    });
  }
}
