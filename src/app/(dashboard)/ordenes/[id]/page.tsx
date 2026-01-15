'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import {
  ArrowLeft,
  DollarSign,
  Truck,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  FileText,
  Play,
  Package,
  ClipboardCheck,
  Send,
  Receipt,
} from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import {
  formatBoxDimensions,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
  ORDER_STATUS_FLOW,
} from '@/lib/utils/format';
import type { OrderItem, OrderStatus, PaymentMethod, PaymentStatus } from '@/lib/types/database';

interface OrderWithRelations {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_m2: number;
  subtotal: number;
  printing_cost: number;
  die_cut_cost: number;
  shipping_cost: number;
  total: number;
  deposit_amount: number;
  deposit_status: PaymentStatus;
  deposit_method: PaymentMethod | null;
  deposit_paid_at: string | null;
  balance_amount: number;
  balance_status: PaymentStatus;
  balance_method: PaymentMethod | null;
  balance_paid_at: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_notes: string | null;
  estimated_delivery: string | null;
  production_started_at: string | null;
  ready_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  // Nuevos campos de integración
  payment_scheme: 'standard' | 'credit';
  quantities_confirmed: boolean;
  quantities_confirmed_at: string | null;
  xubio_deposit_invoice_number: string | null;
  xubio_balance_invoice_number: string | null;
  xubio_remito_number: string | null;
  cot_number: string | null;
  client: {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    has_credit?: boolean;
  } | null;
  quote: {
    id: string;
    quote_number: string;
  } | null;
  items: OrderItem[];
}

const paymentMethodOptions = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'echeq', label: 'eCheq' },
];

export default function OrdenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transferencia');

  // Datos del cheque
  const [checkBank, setCheckBank] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [checkHolder, setCheckHolder] = useState('');
  const [checkCuit, setCheckCuit] = useState('');

  useEffect(() => {
    fetchOrder();
  }, [id]);

  async function fetchOrder() {
    try {
      const res = await fetch(`/api/orders/${id}`);
      if (!res.ok) {
        router.push('/ordenes');
        return;
      }
      const data = await res.json();
      setOrder(data);
    } catch (error) {
      console.error('Error fetching order:', error);
      router.push('/ordenes');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return;

    setActionLoading(`status-${newStatus}`);
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al cambiar estado');
        return;
      }

      await fetchOrder();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al cambiar estado');
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePayment(type: 'deposit' | 'balance') {
    if (!order || !paymentMethod) return;

    // Validar datos del cheque si es necesario
    const isCheck = paymentMethod === 'cheque' || paymentMethod === 'echeq';
    if (isCheck && (!checkBank || !checkNumber || !checkDate)) {
      alert('Complete los datos del cheque: banco, número y fecha de vencimiento');
      return;
    }

    setActionLoading(`payment-${type}`);
    try {
      const body: Record<string, unknown> = {
        payment_type: type,
        method: paymentMethod,
      };

      // Agregar datos del cheque si aplica
      if (isCheck) {
        body.check_bank = checkBank;
        body.check_number = checkNumber;
        body.check_date = checkDate;
        body.check_holder = checkHolder || null;
        body.check_cuit = checkCuit || null;
      }

      const res = await fetch(`/api/orders/${id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al registrar pago');
        return;
      }

      // Limpiar campos del cheque
      setCheckBank('');
      setCheckNumber('');
      setCheckDate('');
      setCheckHolder('');
      setCheckCuit('');

      await fetchOrder();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al registrar pago');
    } finally {
      setActionLoading(null);
    }
  }

  const isCheckPayment = paymentMethod === 'cheque' || paymentMethod === 'echeq';

  if (loading) {
    return <LoadingPage />;
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Orden no encontrada</p>
        <Link href="/ordenes">
          <Button variant="outline" className="mt-4">
            Volver a ordenes
          </Button>
        </Link>
      </div>
    );
  }

  const nextStatuses = ORDER_STATUS_FLOW[order.status as OrderStatus] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/ordenes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
              <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                {ORDER_STATUS_LABELS[order.status as OrderStatus]}
              </Badge>
            </div>
            <p className="text-gray-500">
              Creada el {formatDate(order.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Botón de confirmar cantidades */}
          {order.status === 'ready' && !order.quantities_confirmed && (
            <Link href={`/ordenes/${id}/confirmar-cantidades`}>
              <Button variant="outline" size="sm">
                <ClipboardCheck className="w-4 h-4 mr-1" />
                Confirmar cantidades
              </Button>
            </Link>
          )}

          {/* Botón de despachar */}
          {order.status === 'ready' && order.quantities_confirmed && (
            <Link href={`/ordenes/${id}/despachar`}>
              <Button size="sm">
                <Send className="w-4 h-4 mr-1" />
                Despachar
              </Button>
            </Link>
          )}

          {/* Botones de cambio de estado */}
          {nextStatuses.map((status) => (
            <Button
              key={status}
              variant={status === 'cancelled' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => handleStatusChange(status)}
              disabled={!!actionLoading}
            >
              {actionLoading === `status-${status}` ? (
                <LoadingSpinner size="sm" />
              ) : status === 'confirmed' ? (
                <CheckCircle className="w-4 h-4 mr-1" />
              ) : status === 'in_production' ? (
                <Play className="w-4 h-4 mr-1" />
              ) : status === 'ready' ? (
                <Package className="w-4 h-4 mr-1" />
              ) : status === 'shipped' ? (
                <Truck className="w-4 h-4 mr-1" />
              ) : status === 'delivered' ? (
                <CheckCircle className="w-4 h-4 mr-1" />
              ) : status === 'cancelled' ? (
                <XCircle className="w-4 h-4 mr-1" />
              ) : null}
              {ORDER_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items de la orden</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medidas</TableHead>
                    <TableHead>m2/caja</TableHead>
                    {order.quantities_confirmed ? (
                      <>
                        <TableHead>Cotizado</TableHead>
                        <TableHead>Entregado</TableHead>
                        <TableHead>Diferencia</TableHead>
                      </>
                    ) : (
                      <TableHead>Cantidad</TableHead>
                    )}
                    <TableHead>Total m2</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => {
                    const deliveredQty = (item as OrderItem & { quantity_delivered?: number }).quantity_delivered;
                    const hasDelivered = deliveredQty !== null && deliveredQty !== undefined;
                    const diff = hasDelivered ? deliveredQty - item.quantity : 0;
                    const actualM2 = hasDelivered
                      ? deliveredQty * item.m2_per_box
                      : item.total_m2;

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {formatBoxDimensions(item.length_mm, item.width_mm, item.height_mm)}
                        </TableCell>
                        <TableCell>{formatM2(item.m2_per_box)}</TableCell>
                        {order.quantities_confirmed ? (
                          <>
                            <TableCell className="text-gray-500">
                              {item.quantity.toLocaleString('es-AR')}
                            </TableCell>
                            <TableCell className="font-medium">
                              {hasDelivered ? deliveredQty.toLocaleString('es-AR') : '-'}
                            </TableCell>
                            <TableCell>
                              {diff !== 0 ? (
                                <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {diff > 0 ? '+' : ''}{diff.toLocaleString('es-AR')}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell>{item.quantity.toLocaleString('es-AR')}</TableCell>
                        )}
                        <TableCell className="font-medium">{formatM2(actualM2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Pagos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Deposit */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Seña (50%)</h4>
                    <p className="text-2xl font-bold">{formatCurrency(order.deposit_amount)}</p>
                  </div>
                  <Badge variant={order.deposit_status === 'paid' ? 'success' : 'warning'}>
                    {order.deposit_status === 'paid' ? 'Pagado' : 'Pendiente'}
                  </Badge>
                </div>
                {order.deposit_status === 'paid' ? (
                  <p className="text-sm text-gray-600">
                    Pagado via {PAYMENT_METHOD_LABELS[order.deposit_method as PaymentMethod]} el{' '}
                    {formatDateTime(order.deposit_paid_at!)}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Select
                        options={paymentMethodOptions}
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handlePayment('deposit')}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'payment-deposit' ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          'Registrar pago'
                        )}
                      </Button>
                    </div>
                    {isCheckPayment && (
                      <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded border">
                        <Input
                          placeholder="Banco *"
                          value={checkBank}
                          onChange={(e) => setCheckBank(e.target.value)}
                        />
                        <Input
                          placeholder="Número cheque *"
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                        />
                        <Input
                          type="date"
                          placeholder="Fecha vencimiento *"
                          value={checkDate}
                          onChange={(e) => setCheckDate(e.target.value)}
                        />
                        <Input
                          placeholder="Titular (opcional)"
                          value={checkHolder}
                          onChange={(e) => setCheckHolder(e.target.value)}
                        />
                        <Input
                          placeholder="CUIT titular (opcional)"
                          value={checkCuit}
                          onChange={(e) => setCheckCuit(e.target.value)}
                          className="col-span-2"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Balance */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium">Saldo (50%)</h4>
                    <p className="text-2xl font-bold">{formatCurrency(order.balance_amount)}</p>
                  </div>
                  <Badge variant={order.balance_status === 'paid' ? 'success' : 'warning'}>
                    {order.balance_status === 'paid' ? 'Pagado' : 'Pendiente'}
                  </Badge>
                </div>
                {order.balance_status === 'paid' ? (
                  <p className="text-sm text-gray-600">
                    Pagado via {PAYMENT_METHOD_LABELS[order.balance_method as PaymentMethod]} el{' '}
                    {formatDateTime(order.balance_paid_at!)}
                  </p>
                ) : order.deposit_status === 'paid' ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Select
                        options={paymentMethodOptions}
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handlePayment('balance')}
                        disabled={!!actionLoading}
                      >
                        {actionLoading === 'payment-balance' ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          'Registrar pago'
                        )}
                      </Button>
                    </div>
                    {isCheckPayment && (
                      <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded border">
                        <Input
                          placeholder="Banco *"
                          value={checkBank}
                          onChange={(e) => setCheckBank(e.target.value)}
                        />
                        <Input
                          placeholder="Número cheque *"
                          value={checkNumber}
                          onChange={(e) => setCheckNumber(e.target.value)}
                        />
                        <Input
                          type="date"
                          placeholder="Fecha vencimiento *"
                          value={checkDate}
                          onChange={(e) => setCheckDate(e.target.value)}
                        />
                        <Input
                          placeholder="Titular (opcional)"
                          value={checkHolder}
                          onChange={(e) => setCheckHolder(e.target.value)}
                        />
                        <Input
                          placeholder="CUIT titular (opcional)"
                          value={checkCuit}
                          onChange={(e) => setCheckCuit(e.target.value)}
                          className="col-span-2"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Primero debe registrarse el pago de la seña
                  </p>
                )}
              </div>

              {/* Total */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total orden:</span>
                  <span>{formatCurrency(order.total)}</span>
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
              {order.client ? (
                <div className="space-y-2">
                  <p className="font-medium">{order.client.name}</p>
                  {order.client.company && (
                    <p className="text-sm text-gray-600">{order.client.company}</p>
                  )}
                  {order.client.email && (
                    <p className="text-sm text-gray-600">{order.client.email}</p>
                  )}
                  {order.client.phone && (
                    <p className="text-sm text-gray-600">{order.client.phone}</p>
                  )}
                  <Link href={`/clientes/${order.client.id}`}>
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

          {/* Quote */}
          {order.quote && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Cotizacion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{order.quote.quote_number}</p>
                <Link href={`/cotizaciones/${order.quote.id}`}>
                  <Button variant="outline" size="sm" className="mt-2">
                    Ver cotizacion
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Fechas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.confirmed_at && (
                <div>
                  <p className="text-gray-600">Confirmada:</p>
                  <p className="font-medium">{formatDateTime(order.confirmed_at)}</p>
                </div>
              )}
              {order.production_started_at && (
                <div>
                  <p className="text-gray-600">Inicio producción:</p>
                  <p className="font-medium">{formatDateTime(order.production_started_at)}</p>
                </div>
              )}
              {order.ready_at && (
                <div>
                  <p className="text-gray-600">Lista:</p>
                  <p className="font-medium">{formatDateTime(order.ready_at)}</p>
                </div>
              )}
              {order.shipped_at && (
                <div>
                  <p className="text-gray-600">Despachada:</p>
                  <p className="font-medium">{formatDateTime(order.shipped_at)}</p>
                </div>
              )}
              {order.delivered_at && (
                <div>
                  <p className="text-gray-600">Entregada:</p>
                  <p className="font-medium">{formatDateTime(order.delivered_at)}</p>
                </div>
              )}
              {order.estimated_delivery && (
                <div className="border-t pt-3">
                  <p className="text-gray-600">Entrega estimada:</p>
                  <p className="font-medium">{formatDate(order.estimated_delivery)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Entrega
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.delivery_address ? (
                <>
                  <p>{order.delivery_address}</p>
                  {order.delivery_city && <p>{order.delivery_city}</p>}
                </>
              ) : (
                <p className="text-gray-500">Sin dirección especificada</p>
              )}
              {order.delivery_notes && (
                <p className="text-gray-600 pt-2">{order.delivery_notes}</p>
              )}
            </CardContent>
          </Card>

          {/* Documentos */}
          {(order.xubio_deposit_invoice_number || order.xubio_balance_invoice_number || order.xubio_remito_number || order.cot_number) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.xubio_deposit_invoice_number && (
                  <div>
                    <p className="text-gray-600">Factura seña:</p>
                    <p className="font-mono font-medium">{order.xubio_deposit_invoice_number}</p>
                  </div>
                )}
                {order.xubio_balance_invoice_number && (
                  <div>
                    <p className="text-gray-600">Factura saldo:</p>
                    <p className="font-mono font-medium">{order.xubio_balance_invoice_number}</p>
                  </div>
                )}
                {order.xubio_remito_number && (
                  <div>
                    <p className="text-gray-600">Remito:</p>
                    <p className="font-mono font-medium">{order.xubio_remito_number}</p>
                  </div>
                )}
                {order.cot_number && (
                  <div>
                    <p className="text-gray-600">COT ARBA:</p>
                    <p className="font-mono font-medium">{order.cot_number}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Info de cantidades confirmadas con precisión */}
          {order.quantities_confirmed && (() => {
            // Calcular precisión de producción
            const originalM2 = order.items.reduce((sum, item) => sum + item.quantity * item.m2_per_box, 0);
            const deliveredM2 = order.items.reduce((sum, item) => {
              const delivered = (item as OrderItem & { quantity_delivered?: number }).quantity_delivered;
              const qty = delivered ?? item.quantity;
              return sum + qty * item.m2_per_box;
            }, 0);
            const precisionPercent = originalM2 > 0 ? (deliveredM2 / originalM2) * 100 : 100;
            const diff = deliveredM2 - originalM2;

            return (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <ClipboardCheck className="w-5 h-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700">Cantidades confirmadas</p>
                      <p className="text-sm text-green-600">
                        {order.quantities_confirmed_at && formatDate(order.quantities_confirmed_at)}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Cotizado</p>
                          <p className="font-medium">{formatM2(originalM2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Entregado</p>
                          <p className="font-medium">{formatM2(deliveredM2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Precisión</p>
                          <p className={`font-bold ${
                            precisionPercent >= 98 ? 'text-green-600' :
                            precisionPercent >= 95 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {precisionPercent.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      {diff !== 0 && (
                        <p className={`mt-2 text-xs ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Diferencia: {diff > 0 ? '+' : ''}{formatM2(diff)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
