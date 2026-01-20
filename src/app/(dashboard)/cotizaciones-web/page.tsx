'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import { Globe, Eye, Clock, CheckCircle2, XCircle, UserPlus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import type { PublicQuote, PublicQuoteStatus } from '@/lib/types/database';

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
  };
}

const STATUS_CONFIG: Record<PublicQuoteStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pendiente', color: 'warning', icon: Clock },
  contacted: { label: 'Contactado', color: 'info', icon: Eye },
  converted: { label: 'Convertido', color: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', color: 'error', icon: XCircle },
};

export default function CotizacionesWebPage() {
  const [data, setData] = useState<QuotesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchQuotes();
  }, [statusFilter]);

  async function fetchQuotes() {
    setLoading(true);
    try {
      // Solo obtener cotizaciones que pidieron contacto (requested_contact = true)
      let url = '/api/public-quotes?requested_contact=true';
      if (statusFilter !== 'all') {
        url += `&status=${statusFilter}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !data) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6" />
            Cotizaciones Web
          </h1>
          <p className="text-gray-500">
            Visitantes que solicitaron ser contactados
          </p>
        </div>
      </div>

      {/* Status Tabs */}
      {data?.counts && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todas ({data.counts.total})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'pending'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            Pendientes ({data.counts.pending})
          </button>
          <button
            onClick={() => setStatusFilter('contacted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'contacted'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            Contactados ({data.counts.contacted})
          </button>
          <button
            onClick={() => setStatusFilter('converted')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'converted'
                ? 'bg-green-600 text-white'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            Convertidos ({data.counts.converted})
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'rejected'
                ? 'bg-red-600 text-white'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            Rechazados ({data.counts.rejected})
          </button>
        </div>
      )}

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
                    <th className="px-6 py-3">Caja</th>
                    <th className="px-6 py-3 text-right">m²</th>
                    <th className="px-6 py-3 text-right">Total</th>
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
                                <Button size="sm" className="gap-1">
                                  <UserPlus className="w-4 h-4" />
                                  Convertir
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
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay cotizaciones web</p>
              <p className="text-sm text-gray-400">
                Las solicitudes del cotizador público aparecerán aquí
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
