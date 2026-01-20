/**
 * API: /api/costs/supplies/[id]/history
 * Historial de precios de un insumo
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('supply_price_history')
      .select('*')
      .eq('supply_id', id)
      .order('effective_date', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in GET /api/costs/supplies/[id]/history:', error);
    return NextResponse.json(
      { error: 'Error al obtener historial de precios' },
      { status: 500 }
    );
  }
}
