/**
 * API: GET /api/traffic/stats
 * Endpoint para obtener estadísticas de tráfico en tiempo real
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '24h'; // 24h, 7d, 30d

    let interval = "24 hours";
    if (period === '7d') interval = "7 days";
    if (period === '30d') interval = "30 days";

    // Estadísticas generales
    const { data: liveStats, error: statsError } = await supabase
      .from('traffic_live_stats')
      .select('*')
      .single();

    // Sesiones activas (últimos 5 minutos)
    const { data: activeSessions, error: activeError } = await supabase
      .from('active_sessions')
      .select('*')
      .gte('last_seen_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('last_seen_at', { ascending: false })
      .limit(50);

    // Páginas más visitadas
    const { data: topPages, error: pagesError } = await supabase
      .from('top_pages_24h')
      .select('*')
      .limit(10);

    // Fuentes de tráfico
    const { data: sources, error: sourcesError } = await supabase
      .from('traffic_sources_24h')
      .select('*')
      .limit(10);

    // Dispositivos
    const { data: devices, error: devicesError } = await supabase
      .from('device_stats_24h')
      .select('*');

    // Países
    const { data: countries, error: countriesError } = await supabase
      .from('country_stats_24h')
      .select('*')
      .limit(10);

    // Visitas por hora (últimas 24 horas)
    let hourlyData = null;
    let hourlyError = null;
    try {
      const result = await supabase.rpc('get_hourly_visits', { hours_back: 24 });
      hourlyData = result.data;
      hourlyError = result.error;
    } catch (err) {
      hourlyError = err;
    }

    // Eventos recientes (cotizaciones iniciadas, completadas, etc.)
    const { data: recentEvents, error: eventsError } = await supabase
      .from('web_visits')
      .select('*')
      .neq('event_type', 'page_view')
      .order('created_at', { ascending: false })
      .limit(20);

    if (statsError || activeError || pagesError || sourcesError || devicesError || countriesError) {
      console.error('Error fetching traffic stats:', {
        statsError,
        activeError,
        pagesError,
        sourcesError,
        devicesError,
        countriesError,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        live: liveStats || {
          active_visitors: 0,
          total_page_views: 0,
          unique_pages: 0,
          unique_visitors_24h: 0,
          last_activity: null,
        },
        activeSessions: activeSessions || [],
        topPages: topPages || [],
        sources: sources || [],
        devices: devices || [],
        countries: countries || [],
        hourly: hourlyData || [],
        recentEvents: recentEvents || [],
      },
    });
  } catch (error) {
    console.error('Error in traffic stats:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
