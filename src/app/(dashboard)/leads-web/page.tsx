'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import { Eye, Clock, CheckCircle2, XCircle, Users, Calendar, X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import type { PublicQuote, PublicQuoteStatus } from '@/lib/types/database';

// Opciones rápidas de fecha
const DATE_PRESETS = [
  { label: 'Hoy', getValue: () => {
    const today = new Date().toISOString().split('T')[0];
    return { from: today, to: today };
  }},
  { label: 'Ayer', getValue: () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    return { from: yesterday, to: yesterday };
  }},
  { label: 'Últimos 7 días', getValue: () => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'Últimos 30 días', getValue: () => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'Este mes', getValue: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    return { from, to };
  }},
];

interface PublicQuoteWithFormatted extends PublicQuote {
  quote_number_formatted: string;
}

interface QuotesResponse {
  quotes: PublicQuoteWithFormatted[];
  total: number;
  counts: {
    pending: number;
    contacted: number;
    converted: number;
    rejected: number;
    total: number;
    leads: number;
    quotes: number;
  };
}

const STATUS_CONFIG: Record<PublicQuoteStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendiente', color: 'warning', icon: Clock },
  contacted: { label: 'Contactado', color: 'info', icon: Eye },
  converted: { label: 'Convertido', color: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', color: 'error', icon: XCircle },
};

export default function LeadsWebPage() {
  const [data, setData] = useState<QuotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, dateFrom, dateTo]);

  async function fetchLeads() {
    setLoading(true);
    try {
      // Solo obtener leads (requested_contact = false)
      let url = '/api/public-quotes?requested_contact=false';
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }
      if (dateFrom) {
        url += `&date_from=${dateFrom}`;
      }
      if (dateTo) {
        url += `&date_to=${dateTo}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(preset: typeof DATE_PRESETS[0]) {
    const { from, to } = preset.getValue();
    setDateFrom(from);
    setDateTo(to);
    setActivePreset(preset.label);
  }

  function clearDateFilter() {
    setDateFrom('');
    setDateTo('');
    setActivePreset(null);
  }

  if (loading && !data) {
    return <LoadingPage />;
  }

  // Calcular conteos filtrados solo para leads
  const leadCounts = {
    pending: data?.quotes?.filter(q => q.status === 'pending').length || 0,
    contacted: data?.quotes?.filter(q => q.status === 'contacted').length || 0,
    converted: data?.quotes?.filter(q => q.status === 'converted').length || 0,
    rejected: data?.quotes?.filter(q => q.status === 'rejected').length || 0,
  };
  const totalLeads = data?.total || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            Leads Web
          </h1>
          <p className="text-gray-500">
            Visitantes que vieron el precio pero no solicitaron contacto
          </p>
        </div>
        {data?.counts && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Total leads:</span>
            <span className="text-lg font-semibold px-3 py-1 bg-gray-100 rounded-lg">
              {data.counts.leads}
            </span>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos ({totalLeads})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'pending'
              ? 'bg-amber-600 text-white'
              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          }`}
        >
          Pendientes ({leadCounts.pending})
        </button>
        <button
          onClick={() => setStatusFilter('contacted')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'contacted'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }`}
        >
          Contactados ({leadCounts.contacted})
        </button>
        <button
          onClick={() => setStatusFilter('converted')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'converted'
              ? 'bg-green-600 text-white'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          Convertidos ({leadCounts.converted})
        </button>
        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'rejected'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          Descartados ({leadCounts.rejected})
        </button>
      </div>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filtrar por fecha:</span>
        </div>

        {/* Presets rápidos */}
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activePreset === preset.label
                  ? 'bg-[#002E55] text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Separador */}
        <div className="hidden sm:block w-px h-6 bg-gray-300" />

        {/* Inputs de fecha personalizados */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setActivePreset(null);
            }}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#002E55] focus:border-transparent"
          />
          <span className="text-gray-500">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setActivePreset(null);
            }}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#002E55] focus:border-transparent"
          />
        </div>

        {/* Botón limpiar */}
        {(dateFrom || dateTo) && (
          <button
            onClick={clearDateFilter}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Leads</strong> son visitantes que completaron el paso 2 del cotizador y vieron el precio,
          pero no hicieron click en &quot;Quiero que me contacten&quot;.
          Son potenciales clientes que mostraron interés pero necesitan seguimiento proactivo.
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {data?.quotes && data.quotes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="px-6 py-3">#</th>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Contacto</th>
                    <th className="px-6 py-3">Caja</th>
                    <th className="px-6 py-3 text-right">m²</th>
                    <th className="px-6 py-3 text-right">Total visto</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.quotes.map((quote) => {
                    const statusConfig = STATUS_CONFIG[quote.status];
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr key={quote.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm">{quote.quote_number_formatted}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(quote.created_at).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium">{quote.requester_company || quote.requester_name}</p>
                          {quote.requester_company && (
                            <p className="text-sm text-gray-500">{quote.requester_name}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <p>{quote.requester_email}</p>
                          <p className="text-gray-500">{quote.requester_phone}</p>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {quote.length_mm}x{quote.width_mm}x{quote.height_mm}
                          <span className="text-gray-500 ml-1">
                            ({quote.quantity.toLocaleString('es-AR')} u.)
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm">
                          {quote.total_sqm.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          {formatCurrency(quote.subtotal)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={statusConfig.color as 'success' | 'warning' | 'error' | 'info'}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/cotizaciones-web/${quote.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            {quote.status === 'pending' && (
                              <Link href={`/cotizaciones-web/${quote.id}`}>
                                <Button size="sm" variant="outline" className="gap-1">
                                  Contactar
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay leads web</p>
              <p className="text-sm text-gray-400">
                Los visitantes que vean el precio sin pedir contacto aparecerán aquí
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
