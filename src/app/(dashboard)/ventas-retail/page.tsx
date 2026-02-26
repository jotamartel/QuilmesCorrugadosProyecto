'use client';

import { useEffect, useState, DragEvent } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import {
  Eye,
  Search,
  GripVertical,
  Clock,
  CreditCard,
  Package,
  Truck,
  CheckCircle2,
  Phone,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import {
  FULFILLMENT_STATUS_LABELS,
  FULFILLMENT_STATUS_COLORS,
} from '@/lib/types/database';
import type { FulfillmentStatus, PublicQuote } from '@/lib/types/database';
import { formatBoxDimensions, formatPhone } from '@/lib/utils/format';

const fulfillmentOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending_payment', label: 'Pendiente de pago' },
  { value: 'paid', label: 'Pagado' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'ready_for_dispatch', label: 'Listo para despachar' },
  { value: 'dispatched', label: 'Despachado' },
  { value: 'in_transit', label: 'En camino' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'failed_delivery', label: 'No entregado' },
  { value: 'rescheduled', label: 'Reprogramado' },
];

// Columnas del Kanban — estados activos del fulfillment
const kanbanStatuses: FulfillmentStatus[] = [
  'pending_payment',
  'paid',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
  'in_transit',
  'delivered',
];

// Colores de las summary cards
const summaryCards = [
  {
    key: 'pending_payment',
    label: 'Pendientes de pago',
    icon: Clock,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  },
  {
    key: 'paid',
    label: 'Pagados',
    icon: CreditCard,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'preparing',
    label: 'En preparación',
    icon: Package,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
  },
  {
    key: 'ready_for_dispatch',
    label: 'Listos para despachar',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    key: 'dispatched',
    label: 'Despachados hoy',
    icon: Truck,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

export default function VentasRetailPage() {
  const [sales, setSales] = useState<PublicQuote[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ventas_retail_view_mode');
      if (saved === 'list' || saved === 'kanban') return saved;
    }
    return 'list';
  });
  const [draggedSale, setDraggedSale] = useState<PublicQuote | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<FulfillmentStatus | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('ventas_retail_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    fetchSales();
  }, [statusFilter]);

  async function fetchSales() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('fulfillment_status', statusFilter);

      const res = await fetch(`/api/retail-sales?${params.toString()}`);
      const json = await res.json();
      setSales(json.data || []);
      setCounts(json.counts || {});
    } catch (error) {
      console.error('Error fetching retail sales:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filtro local por busqueda
  const filteredSales = sales.filter(sale => {
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return (
      sale.requester_name?.toLowerCase().includes(s) ||
      sale.requester_email?.toLowerCase().includes(s) ||
      sale.requester_phone?.includes(s) ||
      String(sale.quote_number || '').includes(s)
    );
  });

  // Agrupar por status para kanban
  const salesByStatus = kanbanStatuses.reduce((acc, status) => {
    acc[status] = filteredSales.filter(s => s.fulfillment_status === status);
    return acc;
  }, {} as Record<FulfillmentStatus, PublicQuote[]>);

  // ═══════════════════════════════════════════════════════════
  // DRAG AND DROP
  // ═══════════════════════════════════════════════════════════

  function handleDragStart(e: DragEvent<HTMLDivElement>, sale: PublicQuote) {
    setDraggedSale(sale);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sale.id);
    if (e.currentTarget) e.currentTarget.style.opacity = '0.5';
  }

  function handleDragEnd(e: DragEvent<HTMLDivElement>) {
    setDraggedSale(null);
    setDragOverStatus(null);
    if (e.currentTarget) e.currentTarget.style.opacity = '1';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, status: FulfillmentStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatus !== status) setDragOverStatus(status);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverStatus(null);
    }
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, newStatus: FulfillmentStatus) {
    e.preventDefault();
    setDragOverStatus(null);

    if (!draggedSale || draggedSale.fulfillment_status === newStatus) return;

    // Optimistic update
    const previousSales = [...sales];
    setSales(sales.map(s =>
      s.id === draggedSale.id ? { ...s, fulfillment_status: newStatus } : s
    ));
    setUpdatingId(draggedSale.id);

    try {
      const res = await fetch(`/api/retail-sales/${draggedSale.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillment_status: newStatus }),
      });

      if (!res.ok) {
        setSales(previousSales);
        const data = await res.json();
        alert(data.error || 'Error al actualizar el estado');
      }
    } catch {
      setSales(previousSales);
      alert('Error al actualizar el estado');
    } finally {
      setUpdatingId(null);
      setDraggedSale(null);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ventas Retail</h1>
          <p className="text-gray-500">Pedidos minoristas</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'list' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            Lista
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setViewMode('kanban')}
          >
            Kanban
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map(card => (
          <Card key={card.key}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {counts[card.key] || 0}
                  </p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, email, teléfono o N° cotización..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {viewMode === 'list' && (
              <div className="w-full sm:w-56">
                <Select
                  options={fulfillmentOptions}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  placeholder="Filtrar por estado"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingPage />
      ) : viewMode === 'list' ? (
        /* ═══ LIST VIEW ═══ */
        <Card>
          <CardHeader>
            <CardTitle>Pedidos ({filteredSales.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredSales.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No se encontraron ventas retail
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">N°</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Caja</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Envio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSales.map(sale => {
                      const fs = (sale.fulfillment_status || 'pending_payment') as FulfillmentStatus;
                      return (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">
                            {sale.quote_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div>
                              <p className="font-medium">{sale.requester_name}</p>
                              {sale.requester_company && (
                                <p className="text-xs text-gray-500">{sale.requester_company}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {sale.requester_phone ? (
                              <a
                                href={`tel:${sale.requester_phone}`}
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <Phone className="w-3 h-3" />
                                {formatPhone(sale.requester_phone)}
                              </a>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatBoxDimensions(sale.length_mm, sale.width_mm, sale.height_mm)}
                            <br />
                            <span className="text-xs text-gray-400">x{sale.quantity}</span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {formatCurrency(sale.subtotal)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={FULFILLMENT_STATUS_COLORS[fs]}>
                              {FULFILLMENT_STATUS_LABELS[fs]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {sale.shipping_method === 'retiro_sucursal'
                              ? 'Retiro'
                              : sale.shipping_method === 'envio_caba_amba'
                                ? 'CABA/AMBA'
                                : sale.shipping_method === 'envio_resto_pais'
                                  ? 'Interior'
                                  : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(sale.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/ventas-retail/${sale.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
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
      ) : (
        /* ═══ KANBAN VIEW ═══ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {kanbanStatuses.map(status => (
            <div
              key={status}
              className={`bg-gray-100 rounded-lg p-3 min-h-[200px] transition-colors ${
                dragOverStatus === status ? 'bg-blue-100 ring-2 ring-blue-400' : ''
              }`}
              onDragOver={e => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, status)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm text-gray-700">
                  {FULFILLMENT_STATUS_LABELS[status]}
                </h3>
                <Badge variant="default" className="text-xs">
                  {salesByStatus[status]?.length || 0}
                </Badge>
              </div>
              <div className="space-y-2">
                {(salesByStatus[status] || []).map(sale => (
                  <div
                    key={sale.id}
                    draggable
                    onDragStart={e => handleDragStart(e, sale)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing ${
                      updatingId === sale.id ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm truncate">
                                {sale.requester_name}
                              </p>
                              {updatingId === sale.id && <LoadingSpinner size="sm" />}
                            </div>
                            <p className="text-xs text-gray-500">
                              {sale.quote_number || ''}
                            </p>
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {formatBoxDimensions(sale.length_mm, sale.width_mm, sale.height_mm)} x{sale.quantity}
                            </p>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs font-medium">
                                {formatCurrency(sale.subtotal)}
                              </span>
                              <Link
                                href={`/ventas-retail/${sale.id}`}
                                onClick={e => e.stopPropagation()}
                                className="text-gray-400 hover:text-blue-600 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
                {(!salesByStatus[status] || salesByStatus[status].length === 0) && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Sin pedidos
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
