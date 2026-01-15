'use client';

import { useEffect, useState, DragEvent } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Eye, Search, GripVertical } from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils/format';
import type { Order, OrderStatus } from '@/lib/types/database';

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending_deposit', label: 'Pendiente seña' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_production', label: 'En producción' },
  { value: 'ready', label: 'Lista' },
  { value: 'shipped', label: 'Despachada' },
  { value: 'delivered', label: 'Entregada' },
  { value: 'cancelled', label: 'Cancelada' },
];

// Orden de los estados para el Kanban
const kanbanStatuses: OrderStatus[] = [
  'pending_deposit',
  'confirmed',
  'in_production',
  'ready',
  'shipped',
  'delivered',
];

export default function OrdenesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    // Recuperar preferencia del localStorage (solo en cliente)
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ordenes_view_mode');
      if (saved === 'list' || saved === 'kanban') {
        return saved;
      }
    }
    return 'list';
  });
  const [draggedOrder, setDraggedOrder] = useState<Order | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<OrderStatus | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null);

  // Guardar preferencia de vista en localStorage
  useEffect(() => {
    localStorage.setItem('ordenes_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(search) ||
      (order.client as { name?: string; company?: string } | null)?.name?.toLowerCase().includes(search) ||
      (order.client as { name?: string; company?: string } | null)?.company?.toLowerCase().includes(search)
    );
  });

  // Agrupar ordenes por estado para Kanban
  const ordersByStatus = kanbanStatuses.reduce((acc, status) => {
    acc[status] = filteredOrders.filter(o => o.status === status);
    return acc;
  }, {} as Record<OrderStatus, Order[]>);

  // Drag and Drop handlers
  function handleDragStart(e: DragEvent<HTMLDivElement>, order: Order) {
    setDraggedOrder(order);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', order.id);
    // Agregar clase visual al elemento arrastrado
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5';
    }
  }

  function handleDragEnd(e: DragEvent<HTMLDivElement>) {
    setDraggedOrder(null);
    setDragOverStatus(null);
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, status: OrderStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStatus !== status) {
      setDragOverStatus(status);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    // Solo limpiar si salimos completamente de la columna
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverStatus(null);
    }
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, newStatus: OrderStatus) {
    e.preventDefault();
    setDragOverStatus(null);

    if (!draggedOrder || draggedOrder.status === newStatus) {
      return;
    }

    // Actualizar estado localmente primero (optimistic update)
    const previousOrders = [...orders];
    setOrders(orders.map(o =>
      o.id === draggedOrder.id ? { ...o, status: newStatus } : o
    ));
    setUpdatingOrder(draggedOrder.id);

    try {
      const res = await fetch(`/api/orders/${draggedOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        // Revertir si falla
        setOrders(previousOrders);
        const data = await res.json();
        alert(data.error || 'Error al actualizar el estado');
      }
    } catch (error) {
      // Revertir si hay error
      setOrders(previousOrders);
      console.error('Error updating order status:', error);
      alert('Error al actualizar el estado');
    } finally {
      setUpdatingOrder(null);
      setDraggedOrder(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ordenes</h1>
          <p className="text-gray-500">Gestiona las órdenes de producción</p>
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número o cliente..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {viewMode === 'list' && (
              <div className="w-full sm:w-48">
                <Select
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
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
        /* List View */
        <Card>
          <CardHeader>
            <CardTitle>Lista de Ordenes ({filteredOrders.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No se encontraron ordenes
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">m2</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seña</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{order.order_number}</td>
                        <td className="px-4 py-3 text-sm">
                          <div>
                            <p className="font-medium">
                              {(order.client as { name: string } | null)?.name || 'Sin cliente'}
                            </p>
                            {(order.client as { company?: string } | null)?.company && (
                              <p className="text-xs text-gray-500">
                                {(order.client as { company: string }).company}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">{formatM2(order.total_m2)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCurrency(order.total)}</td>
                        <td className="px-4 py-3">
                          <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                            {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={order.deposit_status === 'paid' ? 'success' : 'warning'}>
                            {order.deposit_status === 'paid' ? 'Pagada' : 'Pendiente'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/ordenes/${order.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Kanban View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kanbanStatuses.map((status) => (
            <div
              key={status}
              className={`bg-gray-100 rounded-lg p-3 min-h-[200px] transition-colors ${
                dragOverStatus === status ? 'bg-blue-100 ring-2 ring-blue-400' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm text-gray-700">
                  {ORDER_STATUS_LABELS[status]}
                </h3>
                <Badge variant="default" className="text-xs">
                  {ordersByStatus[status].length}
                </Badge>
              </div>
              <div className="space-y-2">
                {ordersByStatus[status].map((order) => (
                  <div
                    key={order.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, order)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing ${
                      updatingOrder === order.id ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm">{order.order_number}</p>
                              {updatingOrder === order.id && (
                                <LoadingSpinner size="sm" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {(order.client as { name: string } | null)?.name || 'Sin cliente'}
                            </p>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs text-gray-500">{formatM2(order.total_m2)} m2</span>
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant={order.deposit_status === 'paid' ? 'success' : 'warning'}
                                  className="text-xs"
                                >
                                  {order.deposit_status === 'paid' ? '$' : '!'}
                                </Badge>
                                <Link
                                  href={`/ordenes/${order.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-gray-400 hover:text-blue-600 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
                {ordersByStatus[status].length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
                    Sin ordenes
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
