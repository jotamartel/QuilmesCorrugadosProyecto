'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingPage } from '@/components/ui/loading';
import {
  TrendingDown,
  TrendingUp,
  Users,
  Eye,
  FileText,
  DollarSign,
  CheckCircle2,
  MessageCircle,
  Phone,
  Mail,
  BarChart3,
} from 'lucide-react';

interface FunnelData {
  summary: {
    landing_visitors: number;
    quoter_viewed: number;
    quote_started: number;
    quote_step_2: number;
    price_revealed: number;
    quote_submitted: number;
    quoter_view_rate: number;
    quote_start_rate: number;
    step_2_rate: number;
    price_reveal_rate: number;
    submission_rate: number;
    overall_conversion_rate: number;
  };
  steps: Array<{
    step_name: string;
    visitors: number;
    conversion_rate: number;
    dropoff_count: number;
    dropoff_rate: number;
  }>;
  dropoff: {
    total_sessions: number;
    reached_landing: number;
    reached_quoter: number;
    reached_quote_start: number;
    reached_step_2: number;
    reached_price_reveal: number;
    reached_submit: number;
    dropped_at_landing: number;
    dropped_at_quoter: number;
    dropped_at_quote_start: number;
    dropped_at_step_2: number;
    dropped_at_price_reveal: number;
  };
  contactEvents: Array<{
    event_type: string;
    unique_visitors: number;
    total_events: number;
    date: string;
  }>;
}

const stepIcons: Record<string, React.ReactNode> = {
  'Landing Page': <Users className="w-5 h-5" />,
  'Quoter Viewed': <Eye className="w-5 h-5" />,
  'Quote Started': <FileText className="w-5 h-5" />,
  'Step 2 (Datos)': <Users className="w-5 h-5" />,
  'Price Revealed': <DollarSign className="w-5 h-5" />,
  'Quote Submitted': <CheckCircle2 className="w-5 h-5" />,
};

const eventTypeLabels: Record<string, string> = {
  whatsapp_click: 'WhatsApp',
  phone_click: 'Teléfono',
  email_click: 'Email',
};

export default function FunnelsPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  const fetchFunnel = async () => {
    try {
      const response = await fetch(`/api/traffic/funnel?period=${period}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error fetching funnel data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFunnel();
  }, [period]);

  if (loading) {
    return <LoadingPage />;
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Error al cargar datos del funnel</p>
      </div>
    );
  }

  const { summary, steps, dropoff, contactEvents } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Funnels de Conversión</h1>
          <p className="text-gray-600 mt-1">
            Análisis del embudo de conversión desde landing hasta cotización completada
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.overall_conversion_rate?.toFixed(2) || '0.00'}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.quote_submitted || 0} de {summary.landing_visitors || 0} visitantes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cotizaciones Completadas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.quote_submitted || 0}</div>
            <p className="text-xs text-muted-foreground">
              Últimos {period} días
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precios Revelados</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.price_revealed || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary.submission_rate?.toFixed(1) || '0'}% completan después
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel visual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Embudo de Conversión
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const width = step.conversion_rate || 0;
              const isLast = index === steps.length - 1;
              
              return (
                <div key={step.step_name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {stepIcons[step.step_name] || <Users className="w-5 h-5" />}
                      <div>
                        <p className="font-medium text-sm">{step.step_name}</p>
                        <p className="text-xs text-gray-500">
                          {step.visitors} visitantes
                          {!isLast && step.dropoff_count > 0 && (
                            <span className="text-red-600 ml-2">
                              ({step.dropoff_count} abandonaron - {step.dropoff_rate.toFixed(1)}%)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{step.conversion_rate.toFixed(2)}%</p>
                      <p className="text-xs text-gray-500">del inicio</p>
                    </div>
                  </div>
                  
                  {/* Barra de progreso */}
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        isLast ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  
                  {!isLast && (
                    <div className="flex justify-center">
                      <TrendingDown className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Análisis de abandono */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Puntos de Abandono</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dropoff.dropped_at_landing > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">Después de Landing</span>
                  <span className="font-bold text-red-600">{dropoff.dropped_at_landing}</span>
                </div>
              )}
              {dropoff.dropped_at_quoter > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">Después de Ver Cotizador</span>
                  <span className="font-bold text-red-600">{dropoff.dropped_at_quoter}</span>
                </div>
              )}
              {dropoff.dropped_at_quote_start > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">Después de Empezar Cotización</span>
                  <span className="font-bold text-red-600">{dropoff.dropped_at_quote_start}</span>
                </div>
              )}
              {dropoff.dropped_at_step_2 > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">Después de Paso 2</span>
                  <span className="font-bold text-red-600">{dropoff.dropped_at_step_2}</span>
                </div>
              )}
              {dropoff.dropped_at_price_reveal > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">Después de Ver Precio</span>
                  <span className="font-bold text-red-600">{dropoff.dropped_at_price_reveal}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Eventos de contacto */}
        <Card>
          <CardHeader>
            <CardTitle>Eventos de Contacto</CardTitle>
          </CardHeader>
          <CardContent>
            {contactEvents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No hay eventos de contacto</p>
            ) : (
              <div className="space-y-3">
                {['whatsapp_click', 'phone_click', 'email_click'].map((eventType) => {
                  const events = contactEvents.filter(e => e.event_type === eventType);
                  const total = events.reduce((sum, e) => sum + e.total_events, 0);
                  const unique = events.reduce((sum, e) => sum + e.unique_visitors, 0);
                  
                  if (total === 0) return null;
                  
                  return (
                    <div key={eventType} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {eventType === 'whatsapp_click' && <MessageCircle className="w-5 h-5 text-green-600" />}
                        {eventType === 'phone_click' && <Phone className="w-5 h-5 text-blue-600" />}
                        {eventType === 'email_click' && <Mail className="w-5 h-5 text-gray-600" />}
                        <div>
                          <p className="font-medium text-sm">{eventTypeLabels[eventType]}</p>
                          <p className="text-xs text-gray-500">{unique} visitantes únicos</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{total}</p>
                        <p className="text-xs text-gray-500">clicks</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
