/**
 * API: /api/api-stats
 * Estadísticas de uso de la API pública
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const days = parseInt(searchParams.get('days') || '30');
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Obtener estadísticas generales
    const { data: requests, error: requestsError } = await supabase
      .from('api_requests')
      .select('*')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false });

    if (requestsError) {
      console.error('Error fetching api_requests:', requestsError);
      return NextResponse.json(
        { error: 'Error al obtener estadísticas' },
        { status: 500 }
      );
    }

    const allRequests = requests || [];

    // Calcular estadísticas
    const stats = {
      total_requests: allRequests.length,
      successful_requests: allRequests.filter(r => r.response_status === 200).length,
      failed_requests: allRequests.filter(r => r.response_status >= 400).length,
      rate_limited_requests: allRequests.filter(r => r.rate_limited).length,
      avg_response_time_ms: allRequests.length > 0
        ? Math.round(allRequests.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / allRequests.length)
        : 0,
      total_m2_quoted: allRequests.reduce((sum, r) => sum + (r.total_m2 || 0), 0),
      total_amount_quoted: allRequests.reduce((sum, r) => sum + (r.total_amount || 0), 0),
    };

    // Estadísticas por tipo de fuente
    const bySourceType: Record<string, number> = {};
    allRequests.forEach(r => {
      const source = r.source_type || 'unknown';
      bySourceType[source] = (bySourceType[source] || 0) + 1;
    });

    // Estadísticas por LLM detectado
    const byLLM: Record<string, number> = {};
    allRequests.forEach(r => {
      if (r.llm_detected) {
        byLLM[r.llm_detected] = (byLLM[r.llm_detected] || 0) + 1;
      }
    });

    // Estadísticas por día
    const byDay: Record<string, { requests: number; m2: number; amount: number }> = {};
    allRequests.forEach(r => {
      const day = r.created_at.split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { requests: 0, m2: 0, amount: 0 };
      }
      byDay[day].requests++;
      byDay[day].m2 += r.total_m2 || 0;
      byDay[day].amount += r.total_amount || 0;
    });

    // Convertir a array ordenado
    const dailyStats = Object.entries(byDay)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Últimas 10 requests
    const recentRequests = allRequests.slice(0, 10).map(r => ({
      id: r.id,
      created_at: r.created_at,
      source_type: r.source_type,
      llm_detected: r.llm_detected,
      response_status: r.response_status,
      response_time_ms: r.response_time_ms,
      total_m2: r.total_m2,
      total_amount: r.total_amount,
      boxes_count: r.boxes_count,
      rate_limited: r.rate_limited,
    }));

    /**
     * DEMANDA SIN RESPUESTA
     *
     * Las consultas que el negocio no pudo contestar, agrupadas por motivo.
     *
     * Es lo mismo que hace una tienda cuando mira las busquedas internas que
     * no devolvieron resultados: cada una es alguien que queria algo y se fue
     * con las manos vacias. Acá la fuente es mejor que una caja de busqueda,
     * porque la consulta viene estructurada: sabemos la medida exacta y la
     * cantidad que pidieron.
     *
     * Cuentan como sin respuesta:
     *  - las que fallaron (400/429/500)
     *  - las que cotizaron bien pero no llegan al minimo, o sea que el precio
     *    salio correcto y aun asi no se puede vender
     *  - las que encontraron la API y se fueron sin cotizar
     *
     * Cada grupo trae ejemplos concretos para poder escribir una respuesta:
     * si veinte piden cajas mas anchas que la bobina, falta una pagina que
     * explique el limite y ofrezca la alternativa.
     */
    const SIN_RESPUESTA = new Set([
      'faltan_parametros', 'medida_rechazada', 'limite_de_velocidad',
      'sin_configuracion_de_precios', 'cotizado_bajo_minimo',
      'sin_parametros_devolvio_documentacion',
    ]);

    const grupos: Record<string, {
      motivo: string;
      veces: number;
      desde_asistentes: number;
      ejemplos: Array<{ cuando: string; medida: string | null; cantidad: number | null; detalle: string }>;
    }> = {};

    for (const r of allRequests) {
      const cuerpo = (r.request_body || {}) as Record<string, unknown>;
      const motivoCompleto = typeof cuerpo.motivo === 'string' ? cuerpo.motivo : null;
      if (!motivoCompleto) continue;

      // "medida_rechazada:length_mm must be..." se agrupa por la parte de
      // antes de los dos puntos; el detalle va en los ejemplos.
      const familia = motivoCompleto.split(':')[0];
      if (!SIN_RESPUESTA.has(familia)) continue;

      if (!grupos[familia]) {
        grupos[familia] = { motivo: familia, veces: 0, desde_asistentes: 0, ejemplos: [] };
      }
      const g = grupos[familia];
      g.veces++;
      if (r.source_type === 'llm') g.desde_asistentes++;

      if (g.ejemplos.length < 5) {
        const l = cuerpo.length_mm as number | null;
        const w = cuerpo.width_mm as number | null;
        const h = cuerpo.height_mm as number | null;
        g.ejemplos.push({
          cuando: r.created_at,
          medida: l && w && h ? `${l}x${w}x${h} mm` : null,
          cantidad: (cuerpo.quantity as number | null) ?? null,
          detalle: motivoCompleto.includes(':') ? motivoCompleto.slice(motivoCompleto.indexOf(':') + 1) : '',
        });
      }
    }

    const demandaSinRespuesta = Object.values(grupos).sort((a, b) => b.veces - a.veces);

    return NextResponse.json({
      period: {
        days,
        from: fromDate.toISOString(),
        to: new Date().toISOString(),
      },
      stats,
      by_source_type: bySourceType,
      by_llm: byLLM,
      daily_stats: dailyStats,
      recent_requests: recentRequests,
      demanda_sin_respuesta: demandaSinRespuesta,
    });

  } catch (error) {
    console.error('Error in GET /api/api-stats:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
