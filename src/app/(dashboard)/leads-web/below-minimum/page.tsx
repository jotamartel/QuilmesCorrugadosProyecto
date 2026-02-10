'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import { AlertCircle, MessageCircle, Phone, Mail, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import type { PublicQuote } from '@/lib/types/database';

interface PublicQuoteWithFormatted extends PublicQuote {
  quote_number_formatted: string;
}

interface QuotesResponse {
  quotes: PublicQuoteWithFormatted[];
  total: number;
}

const WHATSAPP_NUMBER = '5491169249801';

export default function BelowMinimumLeadsPage() {
  const [data, setData] = useState<QuotesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBelowMinimumLeads();
  }, []);

  async function fetchBelowMinimumLeads() {
    setLoading(true);
    try {
      const response = await fetch('/api/public-quotes?is_below_minimum=true&status=pending');
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching below minimum leads:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  const quotes = data?.quotes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos Menores al Mínimo</h1>
          <p className="text-gray-600 mt-1">
            Cotizaciones entre 1000 y 3000 m² con precio con recargo
          </p>
        </div>
        <Link
          href="/leads-web"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Volver a Leads Web
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total pendientes</p>
                <p className="text-2xl font-bold text-gray-900">{quotes.length}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">m² promedio</p>
                <p className="text-2xl font-bold text-gray-900">
                  {quotes.length > 0
                    ? (quotes.reduce((sum, q) => sum + q.total_sqm, 0) / quotes.length).toFixed(0)
                    : '0'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Valor total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(quotes.reduce((sum, q) => sum + q.subtotal, 0))}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <span className="text-green-600 font-bold">$</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No hay pedidos menores al mínimo pendientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cotización
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Medidas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cantidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      m² Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Precio/m²
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contacto
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dirección de entrega
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {quotes.map((quote) => {
                    const whatsappMessage = `Hola ${quote.requester_name}, te escribo sobre tu cotización ${quote.quote_number_formatted} (${quote.total_sqm.toFixed(2)}m², ${quote.quantity} cajas).`;
                    const whatsappUrl = `https://wa.me/${quote.requester_phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

                    return (
                      <tr key={quote.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="warning" className="text-xs">
                              Menor al mínimo
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">
                              {quote.quote_number_formatted}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {quote.length_mm} × {quote.width_mm} × {quote.height_mm} mm
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-medium">
                            {quote.quantity.toLocaleString('es-AR')} cajas
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {quote.total_sqm.toFixed(2)} m²
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatCurrency(quote.price_per_m2_applied || quote.price_per_m2)}
                            <span className="text-xs text-yellow-600 ml-1">(con recargo)</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">
                            {formatCurrency(quote.subtotal)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-sm text-gray-900 font-medium">
                              {quote.requester_name}
                            </div>
                            {quote.requester_company && (
                              <div className="text-xs text-gray-500">
                                {quote.requester_company}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              {quote.requester_email}
                            </div>
                            <div className="text-xs text-gray-500">
                              {quote.requester_phone}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1 max-w-xs">
                            {quote.address ? (
                              <>
                                <div className="text-sm text-gray-900 font-medium">
                                  {quote.address}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {quote.city && quote.province && (
                                    <>
                                      {quote.city}, {quote.province}
                                      {quote.postal_code && ` (CP: ${quote.postal_code})`}
                                    </>
                                  )}
                                  {!quote.city && quote.province && quote.province}
                                </div>
                                {quote.distance_km !== null && (
                                  <div className="text-xs text-blue-600 font-medium">
                                    📍 {quote.distance_km} km desde Quilmes
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-xs text-gray-400 italic">
                                Sin dirección
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {formatDate(quote.created_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              <MessageCircle className="w-3 h-3" />
                              WhatsApp
                            </a>
                            <a
                              href={`tel:${quote.requester_phone}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              <Phone className="w-3 h-3" />
                              Llamar
                            </a>
                            <a
                              href={`mailto:${quote.requester_email}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              <Mail className="w-3 h-3" />
                              Email
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
