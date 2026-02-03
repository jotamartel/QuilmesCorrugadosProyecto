'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import {
  Plus,
  Eye,
  Globe,
  Users,
  MessageCircle,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  BarChart3
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS } from '@/lib/utils/format';
import type { Quote, QuoteStatus, PublicQuote } from '@/lib/types/database';

interface DashboardStats {
  // Cotizaciones Backend
  backendQuotes: {
    total: number;
    draft: number;
    sent: number;
    approved: number;
    converted: number;
    totalValue: number;
  };
  // Cotizaciones Web
  webQuotes: {
    total: number;
    pending: number;
    contacted: number;
    converted: number;
    totalValue: number;
  };
  // Leads Web
  leads: {
    total: number;
    pending: number;
    contacted: number;
    converted: number;
  };
  // WhatsApp
  whatsapp: {
    total: number;
    pending: number;
    contacted: number;
    converted: number;
  };
  // Recientes
  recentBackend: Quote[];
  recentWeb: (PublicQuote & { quote_number_formatted: string })[];
}

export default function CotizacionesDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      // Fetch en paralelo
      const [backendRes, webRes, leadsRes, whatsappRes] = await Promise.all([
        fetch('/api/quotes?limit=5'),
        fetch('/api/public-quotes?requested_contact=true&source=web&limit=5'),
        fetch('/api/public-quotes?requested_contact=false&source=web&limit=5'),
        fetch('/api/public-quotes?source=whatsapp&limit=5'),
      ]);

      const [backendData, webData, leadsData, whatsappData] = await Promise.all([
        backendRes.json(),
        webRes.json(),
        leadsRes.json(),
        whatsappRes.json(),
      ]);

      // Calcular estadísticas de cotizaciones backend
      const allBackend = backendData.data || [];
      const backendStats = {
        total: allBackend.length,
        draft: allBackend.filter((q: Quote) => q.status === 'draft').length,
        sent: allBackend.filter((q: Quote) => q.status === 'sent').length,
        approved: allBackend.filter((q: Quote) => q.status === 'approved').length,
        converted: allBackend.filter((q: Quote) => q.status === 'converted').length,
        totalValue: allBackend.reduce((sum: number, q: Quote) => sum + (q.total || 0), 0),
      };

      setStats({
        backendQuotes: backendStats,
        webQuotes: {
          total: webData.counts?.total || 0,
          pending: webData.counts?.pending || 0,
          contacted: webData.counts?.contacted || 0,
          converted: webData.counts?.converted || 0,
          totalValue: (webData.quotes || []).reduce((sum: number, q: PublicQuote) => sum + (q.subtotal || 0), 0),
        },
        leads: {
          total: leadsData.counts?.total || 0,
          pending: leadsData.counts?.pending || 0,
          contacted: leadsData.counts?.contacted || 0,
          converted: leadsData.counts?.converted || 0,
        },
        whatsapp: {
          total: whatsappData.counts?.whatsapp_total || whatsappData.counts?.total || 0,
          pending: whatsappData.counts?.whatsapp_pending || whatsappData.counts?.pending || 0,
          contacted: whatsappData.counts?.whatsapp_contacted || whatsappData.counts?.contacted || 0,
          converted: whatsappData.counts?.whatsapp_converted || whatsappData.counts?.converted || 0,
        },
        recentBackend: allBackend.slice(0, 5),
        recentWeb: webData.quotes?.slice(0, 5) || [],
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Centro de Cotizaciones
          </h1>
          <p className="text-gray-500">
            Resumen de cotizaciones, leads y solicitudes web
          </p>
        </div>
        <Link href="/cotizaciones/nueva">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotización
          </Button>
        </Link>
      </div>

      {/* Cards de Acceso Rápido */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cotizaciones Web */}
        <Link href="/cotizaciones-web">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Cotizaciones Web</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.webQuotes.total || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats?.webQuotes.pending || 0} pendientes
                  </p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Globe className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Leads Web */}
        <Link href="/leads-web">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Leads Web</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.leads.total || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats?.leads.pending || 0} sin contactar
                  </p>
                </div>
                <div className="p-3 bg-amber-100 rounded-full">
                  <Users className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* WhatsApp */}
        <Link href="/whatsapp">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">WhatsApp</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.whatsapp.total || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats?.whatsapp.pending || 0} sin contactar
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <MessageCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Estadísticas Generales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 bg-purple-100 rounded-full mx-auto mb-2">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.backendQuotes.total || 0}</p>
            <p className="text-xs text-gray-500">Cotizaciones Backend</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full mx-auto mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {(stats?.webQuotes.pending || 0) + (stats?.leads.pending || 0)}
            </p>
            <p className="text-xs text-gray-500">Pendientes Total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full mx-auto mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {(stats?.backendQuotes.converted || 0) + (stats?.webQuotes.converted || 0)}
            </p>
            <p className="text-xs text-gray-500">Convertidas Total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center w-10 h-10 bg-emerald-100 rounded-full mx-auto mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency((stats?.backendQuotes.totalValue || 0) + (stats?.webQuotes.totalValue || 0))}
            </p>
            <p className="text-xs text-gray-500">Valor Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Tablas de Recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cotizaciones Backend Recientes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Cotizaciones Recientes
              </CardTitle>
              <Link href="/cotizaciones/lista" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {stats?.recentBackend && stats.recentBackend.length > 0 ? (
              <div className="divide-y">
                {stats.recentBackend.map((quote) => (
                  <Link key={quote.id} href={`/cotizaciones/${quote.id}`}>
                    <div className="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{quote.quote_number}</p>
                        <p className="text-xs text-gray-500">
                          {(quote.client as { name?: string } | null)?.name || 'Sin cliente'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{formatCurrency(quote.total)}</p>
                        <Badge className={`text-xs ${QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}`}>
                          {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm">
                No hay cotizaciones recientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cotizaciones Web Recientes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Solicitudes Web Recientes
              </CardTitle>
              <Link href="/cotizaciones-web" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {stats?.recentWeb && stats.recentWeb.length > 0 ? (
              <div className="divide-y">
                {stats.recentWeb.map((quote) => (
                  <Link key={quote.id} href={`/cotizaciones-web/${quote.id}`}>
                    <div className="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{quote.quote_number_formatted}</p>
                        <p className="text-xs text-gray-500">
                          {quote.requester_company || quote.requester_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{formatCurrency(quote.subtotal)}</p>
                        <Badge
                          variant={
                            quote.status === 'pending' ? 'warning' :
                            quote.status === 'converted' ? 'success' :
                            quote.status === 'contacted' ? 'info' : 'error'
                          }
                          className="text-xs"
                        >
                          {quote.status === 'pending' ? 'Pendiente' :
                           quote.status === 'converted' ? 'Convertido' :
                           quote.status === 'contacted' ? 'Contactado' : 'Rechazado'}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm">
                No hay solicitudes web recientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acciones Rápidas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/cotizaciones/nueva">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Plus className="w-4 h-4" />
                Nueva Cotización
              </Button>
            </Link>
            <Link href="/cotizaciones/lista">
              <Button variant="outline" className="w-full justify-start gap-2">
                <FileText className="w-4 h-4" />
                Ver Cotizaciones
              </Button>
            </Link>
            <Link href="/cotizaciones-web">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Globe className="w-4 h-4" />
                Cot. Web
              </Button>
            </Link>
            <Link href="/leads-web">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Users className="w-4 h-4" />
                Leads Web
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
