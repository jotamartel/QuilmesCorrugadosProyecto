'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  ShoppingCart,
  User,
  Calendar,
  Package,
  Printer,
  Pencil,
} from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate, formatRelativeDate } from '@/lib/utils/dates';
import {
  formatBoxDimensions,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_COLORS,
} from '@/lib/utils/format';
import type { QuoteItem, QuoteStatus } from '@/lib/types/database';

interface QuoteWithRelations {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  total_m2: number;
  price_per_m2: number;
  subtotal: number;
  has_printing: boolean;
  printing_colors: number;
  printing_cost: number;
  has_existing_polymer: boolean;
  has_die_cut: boolean;
  die_cut_cost: number;
  shipping_cost: number;
  shipping_notes: string | null;
  total: number;
  production_days: number;
  estimated_delivery: string | null;
  valid_until: string;
  notes: string | null;
  created_at: string;
  client: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  items: QuoteItem[];
}

export default function CotizacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchQuote();
  }, [id]);

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes/${id}`);
      if (!res.ok) {
        router.push('/cotizaciones');
        return;
      }
      const data = await res.json();
      setQuote(data);
    } catch (error) {
      console.error('Error fetching quote:', error);
      router.push('/cotizaciones');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: 'send' | 'approve' | 'reject' | 'convert') {
    if (!quote) return;

    setActionLoading(action);
    try {
      let endpoint = '';
      let method = 'POST';
      let body = {};

      switch (action) {
        case 'send':
          endpoint = `/api/quotes/${id}/send`;
          break;
        case 'approve':
          endpoint = `/api/quotes/${id}/approve`;
          break;
        case 'reject':
          endpoint = `/api/quotes/${id}`;
          method = 'PATCH';
          body = { status: 'rejected' };
          break;
        case 'convert':
          endpoint = `/api/quotes/${id}/convert`;
          break;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'PATCH' ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al procesar la accion');
        return;
      }

      if (action === 'convert' && data.order) {
        router.push(`/ordenes/${data.order.id}`);
      } else {
        await fetchQuote();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al procesar la accion');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Cotizacion no encontrada</p>
        <Link href="/cotizaciones">
          <Button variant="outline" className="mt-4">
            Volver a cotizaciones
          </Button>
        </Link>
      </div>
    );
  }

  const canEdit = quote.status === 'draft';
  const canSend = quote.status === 'draft';
  const canApprove = quote.status === 'sent' || quote.status === 'draft';
  const canReject = quote.status === 'sent' || quote.status === 'draft';
  const canConvert = quote.status === 'approved';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/cotizaciones">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
              <Badge className={QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}>
                {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
              </Badge>
            </div>
            <p className="text-gray-500">
              Creada el {formatDate(quote.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link href={`/cotizaciones/${id}/editar`}>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </Button>
            </Link>
          )}
          {canSend && (
            <Button
              variant="outline"
              onClick={() => handleAction('send')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'send' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Marcar como Enviada
            </Button>
          )}
          {canApprove && (
            <Button
              onClick={() => handleAction('approve')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'approve' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Aprobar
            </Button>
          )}
          {canReject && (
            <Button
              variant="destructive"
              onClick={() => handleAction('reject')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'reject' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Rechazar
            </Button>
          )}
          {canConvert && (
            <Button
              onClick={() => handleAction('convert')}
              disabled={!!actionLoading}
            >
              {actionLoading === 'convert' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <ShoppingCart className="w-4 h-4 mr-2" />
              )}
              Convertir a Orden
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items de la cotizacion</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medidas</TableHead>
                    <TableHead>Desplegado</TableHead>
                    <TableHead>m2/caja</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Total m2</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quote.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {formatBoxDimensions(item.length_mm, item.width_mm, item.height_mm)}
                        {item.is_oversized && (
                          <Badge variant="warning" className="ml-2">Especial</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.unfolded_length_mm} x {item.unfolded_width_mm} mm
                      </TableCell>
                      <TableCell>{formatM2(item.m2_per_box)}</TableCell>
                      <TableCell>{item.quantity.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="font-medium">{formatM2(item.total_m2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card>
            <CardHeader>
              <CardTitle>Totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total m2:</span>
                  <span className="font-medium">{formatM2(quote.total_m2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Precio por m2:</span>
                  <span className="font-medium">{formatCurrency(quote.price_per_m2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.printing_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Impresion:</span>
                    <span className="font-medium">{formatCurrency(quote.printing_cost)}</span>
                  </div>
                )}
                {quote.die_cut_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Troquelado:</span>
                    <span className="font-medium">{formatCurrency(quote.die_cut_cost)}</span>
                  </div>
                )}
                {quote.shipping_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Envio:</span>
                    <span className="font-medium">{formatCurrency(quote.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-3 text-lg font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(quote.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quote.client ? (
                <div className="space-y-2">
                  <p className="font-medium">{quote.client.name}</p>
                  {quote.client.company && (
                    <p className="text-sm text-gray-600">{quote.client.company}</p>
                  )}
                  {quote.client.email && (
                    <p className="text-sm text-gray-600">{quote.client.email}</p>
                  )}
                  {quote.client.phone && (
                    <p className="text-sm text-gray-600">{quote.client.phone}</p>
                  )}
                  <Link href={`/clientes/${quote.client.id}`}>
                    <Button variant="outline" size="sm" className="mt-2">
                      Ver cliente
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-gray-500">Sin cliente asignado</p>
              )}
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Valida hasta:</p>
                <p className="font-medium">
                  {formatDate(quote.valid_until)}
                  <span className="text-sm text-gray-500 ml-2">
                    ({formatRelativeDate(quote.valid_until)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Entrega estimada:</p>
                <p className="font-medium">
                  {quote.estimated_delivery ? formatDate(quote.estimated_delivery) : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Días de producción:</p>
                <p className="font-medium">{quote.production_days} días hábiles</p>
              </div>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-4 h-4" />
                Opciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-gray-400" />
                <span className="text-sm">
                  {quote.has_printing
                    ? `Con impresion (${quote.printing_colors} colores)`
                    : 'Sin impresion'}
                </span>
              </div>
              {quote.has_existing_polymer && (
                <p className="text-sm text-gray-600">Cliente tiene polimero</p>
              )}
              {quote.has_die_cut && (
                <Badge variant="info">Con troquelado</Badge>
              )}
              {quote.shipping_notes && (
                <div>
                  <p className="text-sm text-gray-600">Envio:</p>
                  <p className="text-sm">{quote.shipping_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
