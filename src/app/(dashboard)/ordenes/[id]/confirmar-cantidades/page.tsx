'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Package, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import type { Order, OrderItem, Client } from '@/lib/types/database';

interface OrderWithDetails extends Order {
  client: Client;
  items: OrderItem[];
}

export default function ConfirmarCantidadesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

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

      // Inicializar cantidades con las cotizadas
      const initialQuantities: Record<string, number> = {};
      for (const item of data.items) {
        initialQuantities[item.id] = item.quantity_delivered || item.quantity;
      }
      setQuantities(initialQuantities);
    } catch (error) {
      console.error('Error:', error);
      router.push('/ordenes');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const items = Object.entries(quantities).map(([itemId, qty]) => ({
        id: itemId,
        quantity_delivered: qty,
      }));

      const res = await fetch(`/api/orders/${id}/confirm-quantities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al confirmar cantidades');
        return;
      }

      alert('Cantidades confirmadas correctamente');
      router.push(`/ordenes/${id}`);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al confirmar cantidades');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Orden no encontrada</p>
      </div>
    );
  }

  if (order.status !== 'ready') {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
        <p className="text-gray-500">La orden debe estar en estado "Lista" para confirmar cantidades</p>
        <Link href={`/ordenes/${id}`}>
          <Button variant="outline" className="mt-4">Volver a la orden</Button>
        </Link>
      </div>
    );
  }

  if (order.quantities_confirmed) {
    return (
      <div className="text-center py-12">
        <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
        <p className="text-gray-500">Las cantidades ya fueron confirmadas</p>
        <Link href={`/ordenes/${id}`}>
          <Button variant="outline" className="mt-4">Volver a la orden</Button>
        </Link>
      </div>
    );
  }

  // Calcular totales
  const totalOriginalM2 = order.items.reduce((sum, item) => sum + (item.quantity * item.m2_per_box), 0);
  const totalDeliveredM2 = order.items.reduce((sum, item) => {
    const qty = quantities[item.id] || item.quantity;
    return sum + (qty * item.m2_per_box);
  }, 0);
  const difference = totalDeliveredM2 - totalOriginalM2;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/ordenes/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Confirmar Cantidades</h1>
          <p className="text-gray-500">Orden {order.order_number}</p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Confirme las cantidades reales producidas</p>
              <p className="text-sm text-blue-700">
                Las cantidades pueden diferir de las cotizadas. El total se recalculara automaticamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Items de la orden</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-700">Medidas</th>
                  <th className="text-center p-4 font-medium text-gray-700">m2/caja</th>
                  <th className="text-center p-4 font-medium text-gray-700">Cotizado</th>
                  <th className="text-center p-4 font-medium text-gray-700">Entregado</th>
                  <th className="text-right p-4 font-medium text-gray-700">m2 Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((item) => {
                  const deliveredQty = quantities[item.id] || item.quantity;
                  const deliveredM2 = deliveredQty * item.m2_per_box;
                  const originalM2 = item.quantity * item.m2_per_box;
                  const diff = deliveredM2 - originalM2;

                  return (
                    <tr key={item.id}>
                      <td className="p-4">
                        <p className="font-medium">{item.length_mm} x {item.width_mm} x {item.height_mm} mm</p>
                      </td>
                      <td className="p-4 text-center text-sm text-gray-600">
                        {item.m2_per_box.toFixed(4)}
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-gray-600">{item.quantity}</span>
                      </td>
                      <td className="p-4">
                        <Input
                          type="number"
                          min="0"
                          value={deliveredQty}
                          onChange={(e) => setQuantities({
                            ...quantities,
                            [item.id]: parseInt(e.target.value) || 0
                          })}
                          className="w-24 mx-auto text-center"
                        />
                      </td>
                      <td className="p-4 text-right">
                        <p className="font-medium">{formatM2(deliveredM2)}</p>
                        {diff !== 0 && (
                          <p className={`text-xs ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {diff > 0 ? '+' : ''}{formatM2(diff)}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50">
            <div className="space-y-1">
              <p className="text-sm text-gray-600">
                Total original: <span className="font-medium">{formatM2(totalOriginalM2)}</span>
              </p>
              <p className="text-sm text-gray-600">
                Total a entregar: <span className="font-bold text-lg">{formatM2(totalDeliveredM2)}</span>
                {difference !== 0 && (
                  <span className={`ml-2 ${difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({difference > 0 ? '+' : ''}{formatM2(difference)})
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href={`/ordenes/${id}`}>
                <Button variant="outline">Cancelar</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? <LoadingSpinner size="sm" /> : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Confirmar cantidades
                  </>
                )}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
