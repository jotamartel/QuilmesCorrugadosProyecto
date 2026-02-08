'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import {
  Users,
  Eye,
  Globe,
  TrendingUp,
  Clock,
  MapPin,
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
  Activity,
  BarChart3,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils/dates';

interface TrafficStats {
  live: {
    active_visitors: number;
    total_page_views: number;
    unique_pages: number;
    unique_visitors_24h: number;
    last_activity: string | null;
  };
  activeSessions: Array<{
    session_id: string;
    visitor_id: string;
    first_seen_at: string;
    last_seen_at: string;
    page_count: number;
    current_page: string;
    referrer: string;
    device_type: string;
    country_code: string;
    city: string;
  }>;
  topPages: Array<{
    page_path: string;
    page_title: string;
    views: number;
    unique_sessions: number;
    unique_visitors: number;
    avg_time_seconds: number;
    last_view: string;
  }>;
  sources: Array<{
    source: string;
    visits: number;
    unique_sessions: number;
  }>;
  devices: Array<{
    device_type: string;
    visits: number;
    unique_sessions: number;
  }>;
  countries: Array<{
    country_code: string;
    visits: number;
    unique_sessions: number;
  }>;
  recentEvents: Array<{
    id: string;
    created_at: string;
    event_type: string;
    page_path: string;
    event_data: Record<string, unknown> | null;
  }>;
}

const deviceIcons: Record<string, React.ReactNode> = {
  desktop: <Monitor className="w-4 h-4" />,
  mobile: <Smartphone className="w-4 h-4" />,
  tablet: <Tablet className="w-4 h-4" />,
};

const deviceLabels: Record<string, string> = {
  desktop: 'Escritorio',
  mobile: 'Móvil',
  tablet: 'Tablet',
  unknown: 'Desconocido',
};

const eventTypeLabels: Record<string, string> = {
  page_view: 'Vista de página',
  quote_started: 'Cotización iniciada',
  quote_completed: 'Cotización completada',
  lead_submitted: 'Lead enviado',
};

export default function TraficoPage() {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/traffic/stats?period=24h');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching traffic stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(fetchStats, 10000); // Actualizar cada 10 segundos
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return <LoadingPage />;
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Error al cargar estadísticas de tráfico</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tráfico en Vivo</h1>
          <p className="text-gray-600 mt-1">
            Monitoreo en tiempo real de visitantes y actividad del sitio
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-actualizar (10s)
          </label>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitantes Activos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.live.active_visitors}</div>
            <p className="text-xs text-muted-foreground">
              Últimos 5 minutos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vistas (24h)</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.live.total_page_views}</div>
            <p className="text-xs text-muted-foreground">
              {stats.live.unique_visitors_24h} visitantes únicos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Páginas Únicas</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.live.unique_pages}</div>
            <p className="text-xs text-muted-foreground">
              Páginas diferentes visitadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Actividad</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {stats.live.last_activity
                ? formatDateTime(new Date(stats.live.last_activity))
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Hace unos momentos
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sesiones activas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Sesiones Activas Ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.activeSessions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No hay visitantes activos en este momento
              </p>
            ) : (
              <div className="space-y-3">
                {stats.activeSessions.map((session) => (
                  <div
                    key={session.session_id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {deviceIcons[session.device_type] || <Monitor className="w-4 h-4" />}
                      <div>
                        <p className="font-medium text-sm">
                          {session.current_page || '/'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {deviceLabels[session.device_type] || 'Desconocido'}
                          {session.city && ` • ${session.city}`}
                          {session.country_code && ` (${session.country_code})`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {formatDateTime(new Date(session.last_seen_at))}
                      </p>
                      <Badge variant="default" className="text-xs">
                        {session.page_count} páginas
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Páginas más visitadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Páginas Más Visitadas (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topPages.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No hay datos de páginas visitadas
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topPages.map((page, index) => (
                  <div
                    key={page.page_path}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full text-blue-600 font-bold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{page.page_path}</p>
                        <p className="text-xs text-gray-500">
                          {page.unique_visitors} visitantes únicos
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{page.views}</p>
                      <p className="text-xs text-gray-500">vistas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fuentes de tráfico */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Fuentes de Tráfico
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.sources.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No hay datos de fuentes</p>
            ) : (
              <div className="space-y-3">
                {stats.sources.map((source) => (
                  <div
                    key={source.source}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">{source.source}</p>
                      <p className="text-xs text-gray-500">
                        {source.unique_sessions} sesiones únicas
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{source.visits}</p>
                      <p className="text-xs text-gray-500">visitas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dispositivos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5" />
              Dispositivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.devices.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No hay datos de dispositivos</p>
            ) : (
              <div className="space-y-3">
                {stats.devices.map((device) => (
                  <div
                    key={device.device_type}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {deviceIcons[device.device_type] || <Monitor className="w-4 h-4" />}
                      <div>
                        <p className="font-medium text-sm">
                          {deviceLabels[device.device_type] || device.device_type}
                        </p>
                        <p className="text-xs text-gray-500">
                          {device.unique_sessions} sesiones únicas
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{device.visits}</p>
                      <p className="text-xs text-gray-500">visitas</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Eventos recientes */}
      {stats.recentEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Eventos Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {eventTypeLabels[event.event_type] || event.event_type}
                    </p>
                    <p className="text-xs text-gray-500">{event.page_path}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {formatDateTime(new Date(event.created_at))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
