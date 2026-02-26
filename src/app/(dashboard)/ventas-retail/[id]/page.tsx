'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  Navigation,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import {
  FULFILLMENT_STATUS_LABELS,
  FULFILLMENT_STATUS_COLORS,
  PUBLIC_QUOTE_STATUS_LABELS,
} from '@/lib/types/database';
import type { FulfillmentStatus, PublicQuote, PublicQuoteStatus } from '@/lib/types/database';
import { formatBoxDimensions, formatCUIT, formatPhone } from '@/lib/utils/format';

// Flujo de transiciones para mostrar botones de accion
const FULFILLMENT_FLOW: Record<FulfillmentStatus, { status: FulfillmentStatus; label: string; icon: typeof Package; color: string }[]> = {
  pending_payment: [],
  paid: [
    { status: 'preparing', label: 'Iniciar preparacion', icon: Package, color: 'bg-yellow-600 hover:bg-yellow-700' },
  ],
  preparing: [
    { status: 'ready_for_dispatch', label: 'Marcar listo', icon: CheckCircle2, color: 'bg-green-600 hover:bg-green-700' },
  ],
  ready_for_dispatch: [
    { status: 'dispatched', label: 'Despachar', icon: Truck, color: 'bg-purple-600 hover:bg-purple-700' },
  ],
  dispatched: [
    { status: 'in_transit', label: 'En camino', icon: Navigation, color: 'bg-indigo-600 hover:bg-indigo-700' },
  ],
  in_transit: [
    { status: 'delivered', label: 'Entregado', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700' },
    { status: 'failed_delivery', label: 'No se pudo entregar', icon: XCircle, color: 'bg-red-600 hover:bg-red-700' },
  ],
  delivered: [],
  failed_delivery: [
    { status: 'rescheduled', label: 'Reprogramar', icon: Clock, color: 'bg-orange-600 hover:bg-orange-700' },
  ],
  rescheduled: [
    { status: 'ready_for_dispatch', label: 'Marcar listo de nuevo', icon: CheckCircle2, color: 'bg-green-600 hover:bg-green-700' },
  ],
};

export default function VentaRetailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [sale, setSale] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchSale();
  }, [id]);

  async function fetchSale() {
    try {
      const res = await fetch(`/api/retail-sales/${id}`);
      if (!res.ok) {
        router.push('/ventas-retail');
        return;
      }
      const json = await res.json();
      setSale(json.data);
    } catch {
      router.push('/ventas-retail');
    } finally {
      setLoading(false);
    }
  }

  async function updateFulfillment(newStatus: FulfillmentStatus, extra?: Record<string, string>) {
    if (!sale || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/retail-sales/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillment_status: newStatus, ...extra }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Error al actualizar');
        return;
      }

      const json = await res.json();
      setSale(json.data);
    } catch {
      alert('Error al actualizar el estado');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <LoadingPage />;
  if (!sale) return null;

  const fs = (sale.fulfillment_status || 'pending_payment') as FulfillmentStatus;
  const qs = (sale.status || 'pending') as PublicQuoteStatus;
  const actions = FULFILLMENT_FLOW[fs] || [];

  const hasAddress = sale.address || sale.city;
  const hasCoords = sale.delivery_lat && sale.delivery_lng;
  const shippingMethodLabel = sale.shipping_method === 'retiro_sucursal'
    ? 'Retiro por sucursal'
    : sale.shipping_method === 'envio_caba_amba'
      ? 'Envio CABA/AMBA'
      : sale.shipping_method === 'envio_resto_pais'
        ? 'Envio al resto del pais'
        : 'No especificado';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/ventas-retail">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Pedido {sale.quote_number || '#' + sale.id.slice(0, 8)}
          </h1>
          <p className="text-gray-500 text-sm">
            Creado el {formatDate(sale.created_at)}
          </p>
        </div>
        <Badge className={FULFILLMENT_STATUS_COLORS[fs]}>
          {FULFILLMENT_STATUS_LABELS[fs]}
        </Badge>
      </div>

      {/* Action buttons */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              {actions.map(action => (
                <Button
                  key={action.status}
                  variant="primary"
                  onClick={() => updateFulfillment(action.status)}
                  disabled={actionLoading}
                  className={`text-white ${action.color}`}
                >
                  <action.icon className="w-4 h-4 mr-2" />
                  {action.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — 2/3 */}
        <div className="lg:col-span-2 space-y-6">

          {/* Detalle del pedido */}
          <Card>
            <CardHeader>
              <CardTitle>Detalle del pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Medidas</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">m2/caja</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">m2 total</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 text-sm font-medium">
                      {formatBoxDimensions(sale.length_mm, sale.width_mm, sale.height_mm)}
                    </td>
                    <td className="px-4 py-3 text-sm">{sale.quantity}</td>
                    <td className="px-4 py-3 text-sm">{sale.sqm_per_box?.toFixed(3)} m²</td>
                    <td className="px-4 py-3 text-sm">{sale.total_sqm?.toFixed(2)} m²</td>
                    <td className="px-4 py-3 text-sm font-medium text-right">
                      {formatCurrency(sale.subtotal)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Totales */}
              <div className="mt-4 pt-4 border-t space-y-2">
                {sale.shipping_cost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Envio</span>
                    <span>{formatCurrency(sale.shipping_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(sale.subtotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mensaje / Notas */}
          {sale.message && (
            <Card>
              <CardHeader>
                <CardTitle>Detalle de la cotización</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">
                  {sale.message}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Timeline de fulfillment */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TimelineItem label="Creado" date={sale.created_at} />
                {sale.status === 'approved' && (
                  <TimelineItem label="Pago aprobado" date={sale.updated_at} highlight />
                )}
                {sale.dispatched_at && (
                  <TimelineItem label="Despachado" date={sale.dispatched_at} />
                )}
                {sale.delivered_at && (
                  <TimelineItem label="Entregado" date={sale.delivered_at} highlight />
                )}
                {sale.failed_delivery_reason && (
                  <TimelineItem
                    label={`No entregado: ${sale.failed_delivery_reason}`}
                    date={sale.updated_at}
                    error
                  />
                )}
                {sale.reschedule_date && (
                  <TimelineItem label={`Reprogramado para ${sale.reschedule_date}`} date={sale.updated_at} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column — 1/3 */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="font-medium text-gray-900">{sale.requester_name}</p>
              {sale.requester_company && (
                <p className="text-sm text-gray-500">{sale.requester_company}</p>
              )}
              {sale.requester_cuit && (
                <p className="text-sm text-gray-500">CUIT: {formatCUIT(sale.requester_cuit)}</p>
              )}

              <div className="pt-2 space-y-2">
                {sale.requester_phone && (
                  <a
                    href={`tel:${sale.requester_phone}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <Phone className="w-4 h-4" />
                    {formatPhone(sale.requester_phone)}
                  </a>
                )}
                {sale.requester_email && (
                  <a
                    href={`mailto:${sale.requester_email}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <Mail className="w-4 h-4" />
                    {sale.requester_email}
                  </a>
                )}
                {sale.requester_phone && (
                  <a
                    href={`https://wa.me/54${sale.requester_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-green-600 hover:underline"
                  >
                    <Phone className="w-4 h-4" />
                    WhatsApp
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Envio */}
          <Card>
            <CardHeader>
              <CardTitle>Envío</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium">{shippingMethodLabel}</span>
              </div>

              {hasAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div className="text-sm text-gray-600">
                    <p>{sale.address}</p>
                    <p>{sale.city}{sale.province ? `, ${sale.province}` : ''}</p>
                    {sale.postal_code && <p>CP {sale.postal_code}</p>}
                  </div>
                </div>
              )}

              {hasCoords && (
                <a
                  href={`https://www.google.com/maps?q=${sale.delivery_lat},${sale.delivery_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <Navigation className="w-4 h-4" />
                  Ver en Google Maps
                </a>
              )}

              {sale.shipping_cost > 0 && (
                <p className="text-sm">
                  Costo de envio: <strong>{formatCurrency(sale.shipping_cost)}</strong>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Estado de pago */}
          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Pago</span>
                <Badge className={
                  qs === 'approved' ? 'bg-green-100 text-green-800'
                    : qs === 'rejected' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                }>
                  {PUBLIC_QUOTE_STATUS_LABELS[qs]}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Fulfillment</span>
                <Badge className={FULFILLMENT_STATUS_COLORS[fs]}>
                  {FULFILLMENT_STATUS_LABELS[fs]}
                </Badge>
              </div>
              {sale.driver_notes && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-500 mb-1">Notas del chofer</p>
                  <p className="text-sm text-gray-700">{sale.driver_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TIMELINE ITEM
// ═══════════════════════════════════════════════════════════

function TimelineItem({
  label,
  date,
  highlight,
  error,
}: {
  label: string;
  date: string;
  highlight?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          error ? 'bg-red-500' : highlight ? 'bg-green-500' : 'bg-gray-300'
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${error ? 'text-red-600' : 'text-gray-700'}`}>{label}</p>
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">
        {formatDate(date)}
      </span>
    </div>
  );
}
