'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import {
  ArrowLeft,
  Package,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  UserPlus,
  MessageSquare,
  Globe,
  Loader2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import type { PublicQuote, PublicQuoteStatus } from '@/lib/types/database';

// Importar BoxPreview3D dinámicamente
const BoxPreview3D = dynamic(
  () => import('@/components/public/BoxPreview3D').then(mod => mod.BoxPreview3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    ),
  }
);

interface PublicQuoteWithFormatted extends PublicQuote {
  quote_number_formatted: string;
}

const STATUS_CONFIG: Record<PublicQuoteStatus, { label: string; variant: 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  contacted: { label: 'Contactado', variant: 'info' },
  converted: { label: 'Convertido', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'error' },
};

export default function CotizacionWebDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [quote, setQuote] = useState<PublicQuoteWithFormatted | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchQuote();
  }, [id]);

  async function fetchQuote() {
    try {
      const response = await fetch(`/api/public-quotes/${id}`);
      if (response.ok) {
        const data = await response.json();
        setQuote(data);
        setNotes(data.notes || '');
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: PublicQuoteStatus) {
    setUpdating(true);
    try {
      const response = await fetch(`/api/public-quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, notes }),
      });

      if (response.ok) {
        fetchQuote();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  }

  async function saveNotes() {
    setUpdating(true);
    try {
      await fetch(`/api/public-quotes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setUpdating(false);
    }
  }

  async function convertToClient(createQuote: boolean = false) {
    setConverting(true);
    try {
      const response = await fetch(`/api/public-quotes/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create_quote: createQuote }),
      });

      if (response.ok) {
        const result = await response.json();
        // Redirigir al cliente creado
        router.push(`/clientes/${result.client_id}`);
      }
    } catch (error) {
      console.error('Error converting:', error);
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Cotización no encontrada</p>
        <Link href="/cotizaciones-web">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[quote.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/cotizaciones-web">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Globe className="w-6 h-6" />
              {quote.quote_number_formatted}
            </h1>
            <p className="text-gray-500">
              Recibida el {new Date(quote.created_at).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
        <Badge variant={statusConfig.variant} className="text-sm px-3 py-1">
          {statusConfig.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Datos del solicitante
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nombre/Razón Social</p>
                  <p className="font-medium">{quote.requester_name}</p>
                </div>
                {quote.requester_company && (
                  <div>
                    <p className="text-sm text-gray-500">Nombre Fantasía</p>
                    <p className="font-medium">{quote.requester_company}</p>
                  </div>
                )}
                {quote.requester_cuit && (
                  <div>
                    <p className="text-sm text-gray-500">CUIT</p>
                    <p className="font-medium">{quote.requester_cuit}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Condición IVA</p>
                  <p className="font-medium capitalize">{quote.requester_tax_condition.replace('_', ' ')}</p>
                </div>
              </div>

              <hr />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <a href={`mailto:${quote.requester_email}`} className="font-medium text-blue-600 hover:underline">
                      {quote.requester_email}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Teléfono</p>
                    <a href={`tel:${quote.requester_phone}`} className="font-medium text-blue-600 hover:underline">
                      {quote.requester_phone}
                    </a>
                  </div>
                </div>
              </div>

              {(quote.address || quote.city) && (
                <>
                  <hr />
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                    <div>
                      <p className="text-sm text-gray-500">Dirección</p>
                      <p className="font-medium">
                        {[quote.address, quote.city, quote.province, quote.postal_code]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Datos de la caja */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Datos de la caja
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Largo</p>
                      <p className="font-medium">{quote.length_mm} mm</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Ancho</p>
                      <p className="font-medium">{quote.width_mm} mm</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Alto</p>
                      <p className="font-medium">{quote.height_mm} mm</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Cantidad</p>
                    <p className="font-medium">{quote.quantity.toLocaleString('es-AR')} unidades</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Impresión</p>
                    <p className="font-medium">
                      {quote.has_printing ? `Sí, ${quote.printing_colors} color${quote.printing_colors > 1 ? 'es' : ''}` : 'No'}
                    </p>
                  </div>

                  {quote.design_file_name && (
                    <div>
                      <p className="text-sm text-gray-500">Diseño</p>
                      <a
                        href={quote.design_file_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-4 h-4" />
                        {quote.design_file_name}
                      </a>
                    </div>
                  )}

                  <hr />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Medida plancha</p>
                      <p className="font-medium">{quote.sheet_width_mm} x {quote.sheet_length_mm} mm</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">m² por caja</p>
                      <p className="font-medium">{quote.sqm_per_box.toFixed(4)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">m² totales</p>
                      <p className="font-medium">{quote.total_sqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Días de producción</p>
                      <p className="font-medium">{quote.estimated_days} días</p>
                    </div>
                  </div>
                </div>

                {/* Vista 3D pequeña */}
                <div>
                  <BoxPreview3D
                    length={quote.length_mm}
                    width={quote.width_mm}
                    height={quote.height_mm}
                    autoRotate={true}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mensaje del cliente */}
          {quote.message && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Mensaje del cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{quote.message}</p>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-500">
              <p>IP: {quote.source_ip || 'No disponible'}</p>
              <p className="truncate">User Agent: {quote.source_user_agent || 'No disponible'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Precio */}
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-700">Total cotizado</p>
              <p className="text-3xl font-bold text-amber-700">{formatCurrency(quote.subtotal)}</p>
              <p className="text-sm text-amber-600 mt-1">
                {formatCurrency(quote.unit_price)} por caja
              </p>
            </CardContent>
          </Card>

          {/* Notas internas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Notas internas</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Agregar notas..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={saveNotes}
                disabled={updating}
                className="mt-2"
              >
                Guardar notas
              </Button>
            </CardContent>
          </Card>

          {/* Acciones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quote.status === 'pending' && (
                <>
                  <Button
                    onClick={() => updateStatus('contacted')}
                    disabled={updating}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    Marcar como contactado
                  </Button>
                  <Button
                    onClick={() => convertToClient(true)}
                    disabled={converting}
                    className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {converting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Convertir a cliente + cotización
                  </Button>
                  <Button
                    onClick={() => convertToClient(false)}
                    disabled={converting}
                    variant="outline"
                    className="w-full justify-start gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    Solo crear cliente
                  </Button>
                  <Button
                    onClick={() => updateStatus('rejected')}
                    disabled={updating}
                    variant="ghost"
                    className="w-full justify-start gap-2 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Rechazar
                  </Button>
                </>
              )}

              {quote.status === 'contacted' && (
                <>
                  <Button
                    onClick={() => convertToClient(true)}
                    disabled={converting}
                    className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {converting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Convertir a cliente
                  </Button>
                  <Button
                    onClick={() => updateStatus('rejected')}
                    disabled={updating}
                    variant="ghost"
                    className="w-full justify-start gap-2 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Rechazar
                  </Button>
                </>
              )}

              {quote.status === 'converted' && quote.converted_to_client_id && (
                <Link href={`/clientes/${quote.converted_to_client_id}`}>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <User className="w-4 h-4" />
                    Ver cliente
                  </Button>
                </Link>
              )}

              {quote.status === 'converted' && quote.converted_to_quote_id && (
                <Link href={`/cotizaciones/${quote.converted_to_quote_id}`}>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="w-4 h-4" />
                    Ver cotización
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
