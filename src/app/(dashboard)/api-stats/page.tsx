'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { LoadingPage } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Zap,
  Clock,
  AlertTriangle,
  TrendingUp,
  Bot,
  Globe,
  Server,
  CheckCircle2,
  XCircle,
  Bell,
  Info,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';

interface ApiStats {
  period: {
    days: number;
    from: string;
    to: string;
  };
  stats: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    rate_limited_requests: number;
    avg_response_time_ms: number;
    total_m2_quoted: number;
    total_amount_quoted: number;
  };
  by_source_type: Record<string, number>;
  by_llm: Record<string, number>;
  daily_stats: Array<{
    date: string;
    requests: number;
    m2: number;
    amount: number;
  }>;
  recent_requests: Array<{
    id: string;
    created_at: string;
    source_type: string;
    llm_detected: string | null;
    response_status: number;
    response_time_ms: number;
    total_m2: number;
    total_amount: number;
    boxes_count: number;
    rate_limited: boolean;
  }>;
}

const periodOptions = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

const sourceTypeLabels: Record<string, string> = {
  llm: 'LLM / IA',
  api_client: 'Cliente API',
  browser: 'Navegador',
  unknown: 'Desconocido',
};

const llmLabels: Record<string, string> = {
  gpt: 'GPT / ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  cohere: 'Cohere',
  gemini: 'Gemini',
  bing: 'Bing AI',
};

interface ApiAlert {
  id: string;
  type: 'rate_limit' | 'high_usage' | 'new_llm' | 'error_spike' | 'info';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  created_at: string;
}

export default function ApiStatsPage() {
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    fetchStats();
    fetchAlerts();
  }, [period]);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch(`/api/api-stats?days=${period}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/api-alerts?hours=24');
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-gray-500">
        Error al cargar estadísticas
      </div>
    );
  }

  const successRate = stats.stats.total_requests > 0
    ? ((stats.stats.successful_requests / stats.stats.total_requests) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Estadísticas de API
          </h1>
          <p className="text-gray-500">
            Monitoreo de uso de la API pública v1
          </p>
        </div>
        <div className="w-48">
          <Select
            options={periodOptions}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Alertas (últimas 24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {alerts.filter(a => a.type !== 'info').slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    alert.severity === 'error' ? 'bg-red-50 border border-red-200' :
                    alert.severity === 'warning' ? 'bg-amber-50 border border-amber-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}
                >
                  {alert.severity === 'error' && <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />}
                  {alert.severity === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                  {alert.severity === 'info' && <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      alert.severity === 'error' ? 'text-red-800' :
                      alert.severity === 'warning' ? 'text-amber-800' :
                      'text-blue-800'
                    }`}>
                      {alert.title}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      alert.severity === 'error' ? 'text-red-600' :
                      alert.severity === 'warning' ? 'text-amber-600' :
                      'text-blue-600'
                    }`}>
                      {alert.message}
                    </p>
                  </div>
                </div>
              ))}
              {alerts.filter(a => a.type !== 'info').length === 0 && (
                <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm">Sin alertas en las últimas 24 horas</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.stats.total_requests.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">Requests totales</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{successRate}%</p>
                <p className="text-xs text-gray-500">Tasa de éxito</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.stats.avg_response_time_ms}ms
                </p>
                <p className="text-xs text-gray-500">Tiempo promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.stats.rate_limited_requests}
                </p>
                <p className="text-xs text-gray-500">Rate limited</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cotizaciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.stats.total_m2_quoted.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²
                </p>
                <p className="text-xs text-gray-500">Total m² cotizados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats.stats.total_amount_quoted)}
                </p>
                <p className="text-xs text-gray-500">Total cotizado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Por tipo de fuente y LLM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Por tipo de fuente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Por tipo de fuente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.by_source_type).length === 0 ? (
              <p className="text-gray-500 text-sm">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.by_source_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {type === 'llm' && <Bot className="w-4 h-4 text-purple-500" />}
                        {type === 'api_client' && <Server className="w-4 h-4 text-blue-500" />}
                        {type === 'browser' && <Globe className="w-4 h-4 text-green-500" />}
                        {type === 'unknown' && <Activity className="w-4 h-4 text-gray-400" />}
                        <span className="text-sm text-gray-700">
                          {sourceTypeLabels[type] || type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{
                              width: `${(count / stats.stats.total_requests) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-12 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Por LLM detectado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Por LLM detectado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(stats.by_llm).length === 0 ? (
              <p className="text-gray-500 text-sm">Sin detecciones de LLM</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(stats.by_llm)
                  .sort((a, b) => b[1] - a[1])
                  .map(([llm, count]) => (
                    <div key={llm} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {llmLabels[llm] || llm}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{
                              width: `${(count / stats.stats.total_requests) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-12 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico diario simple */}
      {stats.daily_stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests por día</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {stats.daily_stats.slice(-30).map((day, index) => {
                const maxRequests = Math.max(...stats.daily_stats.map(d => d.requests));
                const height = maxRequests > 0 ? (day.requests / maxRequests) * 100 : 0;
                return (
                  <div
                    key={day.date}
                    className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer group relative"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.date}: ${day.requests} requests`}
                  >
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {day.date.slice(5)}: {day.requests}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{stats.daily_stats[0]?.date.slice(5)}</span>
              <span>{stats.daily_stats[stats.daily_stats.length - 1]?.date.slice(5)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimas requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {stats.recent_requests.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No hay requests registradas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Fuente</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">LLM</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Status</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Tiempo</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">m²</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_requests.map((req) => (
                    <tr key={req.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(req.created_at).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            req.source_type === 'llm' ? 'info' :
                            req.source_type === 'api_client' ? 'success' :
                            'default'
                          }
                          className="text-xs"
                        >
                          {sourceTypeLabels[req.source_type] || req.source_type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {req.llm_detected ? (
                          <span className="text-purple-600 font-medium">
                            {llmLabels[req.llm_detected] || req.llm_detected}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {req.rate_limited ? (
                          <Badge variant="warning" className="text-xs">429</Badge>
                        ) : req.response_status === 200 ? (
                          <Badge variant="success" className="text-xs">200</Badge>
                        ) : (
                          <Badge variant="error" className="text-xs">{req.response_status}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{req.response_time_ms}ms</td>
                      <td className="px-4 py-2 text-gray-600">
                        {req.total_m2?.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '-'}
                      </td>
                      <td className="px-4 py-2 text-gray-900 font-medium">
                        {req.total_amount ? formatCurrency(req.total_amount) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
