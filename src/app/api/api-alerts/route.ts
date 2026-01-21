import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Alert {
  id: string;
  type: 'rate_limit' | 'high_usage' | 'new_llm' | 'error_spike' | 'info';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  created_at: string;
  metadata?: Record<string, unknown>;
}

// GET: Obtener alertas de API
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '24');

  try {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    const alerts: Alert[] = [];

    // 1. Verificar rate limits en las últimas horas
    const { data: rateLimitedRequests } = await supabase
      .from('api_requests')
      .select('created_at, ip_address, api_key, source_type')
      .eq('rate_limited', true)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (rateLimitedRequests && rateLimitedRequests.length > 0) {
      const uniqueSources = new Set(rateLimitedRequests.map(r => r.api_key || r.ip_address));
      alerts.push({
        id: `rate_limit_${Date.now()}`,
        type: 'rate_limit',
        title: 'Rate Limits Alcanzados',
        message: `${rateLimitedRequests.length} requests fueron limitadas de ${uniqueSources.size} fuente(s) diferentes en las últimas ${hours}h.`,
        severity: rateLimitedRequests.length > 10 ? 'error' : 'warning',
        created_at: rateLimitedRequests[0].created_at,
        metadata: {
          count: rateLimitedRequests.length,
          unique_sources: uniqueSources.size,
        },
      });
    }

    // 2. Verificar picos de errores (status != 200)
    const { data: errorRequests, count: errorCount } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .neq('response_status', 200)
      .neq('response_status', 429) // Excluir rate limits
      .gte('created_at', since.toISOString());

    const { count: totalCount } = await supabase
      .from('api_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since.toISOString());

    if (totalCount && errorCount && totalCount > 10) {
      const errorRate = (errorCount / totalCount) * 100;
      if (errorRate > 10) {
        alerts.push({
          id: `error_spike_${Date.now()}`,
          type: 'error_spike',
          title: 'Tasa de Errores Alta',
          message: `${errorRate.toFixed(1)}% de las requests fallaron en las últimas ${hours}h (${errorCount} de ${totalCount}).`,
          severity: errorRate > 25 ? 'error' : 'warning',
          created_at: new Date().toISOString(),
          metadata: {
            error_count: errorCount,
            total_count: totalCount,
            error_rate: errorRate,
          },
        });
      }
    }

    // 3. Detectar nuevos LLMs usando la API
    const { data: llmRequests } = await supabase
      .from('api_requests')
      .select('llm_detected, created_at')
      .not('llm_detected', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });

    if (llmRequests && llmRequests.length > 0) {
      // Obtener LLMs que vimos antes
      const previousLLMs = new Set<string>();
      const { data: olderRequests } = await supabase
        .from('api_requests')
        .select('llm_detected')
        .not('llm_detected', 'is', null)
        .lt('created_at', since.toISOString())
        .limit(1000);

      if (olderRequests) {
        olderRequests.forEach(r => {
          if (r.llm_detected) previousLLMs.add(r.llm_detected);
        });
      }

      // Encontrar nuevos LLMs
      const currentLLMs = new Set(llmRequests.map(r => r.llm_detected).filter(Boolean));
      const newLLMs = [...currentLLMs].filter(llm => llm && !previousLLMs.has(llm));

      if (newLLMs.length > 0) {
        alerts.push({
          id: `new_llm_${Date.now()}`,
          type: 'new_llm',
          title: 'Nuevo LLM Detectado',
          message: `Se detectó uso de la API por: ${newLLMs.join(', ')}.`,
          severity: 'info',
          created_at: llmRequests.find(r => newLLMs.includes(r.llm_detected!))?.created_at || new Date().toISOString(),
          metadata: {
            new_llms: newLLMs,
          },
        });
      }
    }

    // 4. Verificar alto volumen de uso
    const { data: hourlyStats } = await supabase
      .from('api_requests')
      .select('created_at')
      .gte('created_at', since.toISOString());

    if (hourlyStats && hourlyStats.length > 100) {
      // Calcular promedio por hora
      const avgPerHour = hourlyStats.length / hours;
      if (avgPerHour > 50) {
        alerts.push({
          id: `high_usage_${Date.now()}`,
          type: 'high_usage',
          title: 'Alto Volumen de Uso',
          message: `La API está recibiendo ${Math.round(avgPerHour)} requests/hora en promedio (${hourlyStats.length} total en ${hours}h).`,
          severity: avgPerHour > 100 ? 'warning' : 'info',
          created_at: new Date().toISOString(),
          metadata: {
            total_requests: hourlyStats.length,
            avg_per_hour: avgPerHour,
          },
        });
      }
    }

    // 5. Resumen general (siempre incluir)
    if (totalCount && totalCount > 0) {
      const { data: llmCount } = await supabase
        .from('api_requests')
        .select('*', { count: 'exact', head: true })
        .not('llm_detected', 'is', null)
        .gte('created_at', since.toISOString());

      alerts.push({
        id: `summary_${Date.now()}`,
        type: 'info',
        title: 'Resumen de Actividad',
        message: `${totalCount} requests totales en las últimas ${hours}h. ${llmCount || 0} desde LLMs detectados.`,
        severity: 'info',
        created_at: new Date().toISOString(),
        metadata: {
          total_requests: totalCount,
          llm_requests: llmCount || 0,
        },
      });
    }

    // Ordenar alertas por severidad y fecha
    const severityOrder = { error: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({ alerts, period_hours: hours });
  } catch (error) {
    console.error('Error fetching API alerts:', error);
    return NextResponse.json(
      { error: 'Error al obtener alertas' },
      { status: 500 }
    );
  }
}
