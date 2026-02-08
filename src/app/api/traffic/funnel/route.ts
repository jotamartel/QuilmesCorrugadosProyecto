/**
 * API: GET /api/traffic/funnel
 * Endpoint para obtener datos del funnel de conversión
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30'; // días

    // Obtener resumen del funnel
    const { data: funnelSummary, error: summaryError } = await supabase
      .from('conversion_funnel_summary')
      .select('*')
      .single();

    // Obtener funnel detallado por día
    const { data: funnelDaily, error: dailyError } = await supabase
      .from('conversion_funnel')
      .select('*')
      .order('date', { ascending: false })
      .limit(parseInt(period));

    // Obtener análisis de abandono
    const { data: dropoffAnalysis, error: dropoffError } = await supabase
      .from('funnel_dropoff_analysis')
      .select('*')
      .single();

    // Obtener eventos de contacto
    const { data: contactEvents, error: contactError } = await supabase
      .from('contact_events_summary')
      .select('*')
      .order('date', { ascending: false })
      .limit(30);

    // Obtener funnel usando la función
    const { data: funnelSteps, error: stepsError } = await supabase
      .rpc('get_conversion_funnel', { days_back: parseInt(period) })
      .catch(() => ({ data: null, error: null }));

    if (summaryError || dailyError || dropoffError || contactError) {
      console.error('Error fetching funnel data:', {
        summaryError,
        dailyError,
        dropoffError,
        contactError,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: funnelSummary || {},
        daily: funnelDaily || [],
        dropoff: dropoffAnalysis || {},
        contactEvents: contactEvents || [],
        steps: funnelSteps || [],
      },
    });
  } catch (error) {
    console.error('Error in funnel stats:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
