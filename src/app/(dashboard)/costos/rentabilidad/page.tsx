'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker, DateRange } from '@/components/ui/date-range-picker';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ArrowLeft,
  Download,
  Calendar,
  Percent,
  Target,
} from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import Link from 'next/link';
import { format, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface OrderProfitability {
  order_id: string;
  order_number: string;
  order_date: string;
  status: string;
  client_name: string;
  client_company: string | null;
  total_m2: number;
  total_revenue: number;
  direct_costs: number;
  gross_profit: number;
  gross_margin_percent: number;
  has_tracked_costs: boolean;
}

interface ProfitabilitySummary {
  period: { from: string; to: string };
  total_orders: number;
  total_m2: number;
  total_revenue: number;
  total_direct_costs: number;
  gross_profit: number;
  gross_margin_percent: number;
  fixed_costs: number;
  operational_expenses: number;
  net_profit: number;
  net_margin_percent: number;
  avg_revenue_per_m2: number;
  avg_cost_per_m2: number;
  estimated_cost_per_m2: number;
}

const getDefaultDateRange = (): DateRange => ({
  from: startOfMonth(subMonths(new Date(), 2)),
  to: new Date(),
});

export default function RentabilidadPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [orders, setOrders] = useState<OrderProfitability[]>([]);
  const [summary, setSummary] = useState<ProfitabilitySummary | null>(null);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      const res = await fetch(`/api/costs/profitability?from=${fromDate}&to=${toDate}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching profitability:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/costos">
              <Button variant="ghost" size="sm" className="gap-1">
                <ArrowLeft className="w-4 h-4" />
                Volver
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Análisis de Rentabilidad</h1>
              <p className="text-gray-500">Margen bruto y neto por período</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Período de análisis
            </label>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Facturación</p>
                    <p className="text-2xl font-bold">{formatCurrency(summary.total_revenue)}</p>
                    <p className="text-xs text-gray-400">{summary.total_orders} órdenes</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Utilidad Bruta</p>
                    <p className={`text-2xl font-bold ${summary.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(summary.gross_profit)}
                    </p>
                    <p className="text-xs text-gray-400">Margen: {summary.gross_margin_percent}%</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${summary.gross_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    {summary.gross_profit >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-green-600" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-red-600" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Utilidad Neta</p>
                    <p className={`text-2xl font-bold ${summary.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(summary.net_profit)}
                    </p>
                    <p className="text-xs text-gray-400">Margen: {summary.net_margin_percent}%</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${summary.net_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Target className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">m² Producidos</p>
                    <p className="text-2xl font-bold">{formatM2(summary.total_m2)}</p>
                    <p className="text-xs text-gray-400">Prom: {formatCurrency(summary.avg_revenue_per_m2)}/m²</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Package className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Desglose de costos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Desglose de Ingresos y Costos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-gray-600">Facturación Total</span>
                    <span className="font-bold text-lg">{formatCurrency(summary.total_revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b text-red-600">
                    <span>(-) Costos Directos</span>
                    <span className="font-medium">- {formatCurrency(summary.total_direct_costs)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b bg-green-50 px-2 rounded">
                    <span className="font-medium text-green-700">= Utilidad Bruta</span>
                    <span className="font-bold text-green-700">{formatCurrency(summary.gross_profit)} ({summary.gross_margin_percent}%)</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b text-red-600">
                    <span>(-) Costos Fijos</span>
                    <span className="font-medium">- {formatCurrency(summary.fixed_costs)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b text-red-600">
                    <span>(-) Gastos Operativos</span>
                    <span className="font-medium">- {formatCurrency(summary.operational_expenses)}</span>
                  </div>
                  <div className={`flex justify-between items-center py-3 px-2 rounded ${summary.net_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <span className={`font-bold ${summary.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>= Utilidad Neta</span>
                    <span className={`font-bold text-lg ${summary.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(summary.net_profit)} ({summary.net_margin_percent}%)
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Métricas por m²</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Precio promedio de venta</span>
                      <span className="font-bold">{formatCurrency(summary.avg_revenue_per_m2)} / m²</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-600">Costo promedio real</span>
                      <span className="font-bold">{formatCurrency(summary.avg_cost_per_m2)} / m²</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-gray-600">Costo estimado (config)</span>
                      <span className="font-medium text-gray-500">{formatCurrency(summary.estimated_cost_per_m2)} / m²</span>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700 mb-2">Margen bruto por m²</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {formatCurrency(summary.avg_revenue_per_m2 - summary.avg_cost_per_m2)}
                    </p>
                    <p className="text-sm text-blue-600">
                      {summary.avg_revenue_per_m2 > 0
                        ? `${(((summary.avg_revenue_per_m2 - summary.avg_cost_per_m2) / summary.avg_revenue_per_m2) * 100).toFixed(1)}% del precio`
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Tabla de órdenes */}
      <Card>
        <CardHeader>
          <CardTitle>Rentabilidad por Orden</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-3">Orden</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3 text-right">m²</th>
                    <th className="pb-3 text-right">Facturado</th>
                    <th className="pb-3 text-right">Costos</th>
                    <th className="pb-3 text-right">Utilidad</th>
                    <th className="pb-3 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr key={order.order_id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <Link
                          href={`/ordenes/${order.order_id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {order.order_number}
                        </Link>
                        {!order.has_tracked_costs && (
                          <Badge variant="warning" className="ml-2 text-xs">Estimado</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <p className="font-medium">{order.client_name}</p>
                        {order.client_company && (
                          <p className="text-sm text-gray-500">{order.client_company}</p>
                        )}
                      </td>
                      <td className="py-3 text-right">{formatM2(order.total_m2)}</td>
                      <td className="py-3 text-right font-medium">{formatCurrency(order.total_revenue)}</td>
                      <td className="py-3 text-right text-gray-600">{formatCurrency(order.direct_costs)}</td>
                      <td className={`py-3 text-right font-medium ${order.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(order.gross_profit)}
                      </td>
                      <td className="py-3 text-right">
                        <span className={`inline-flex items-center gap-1 font-bold ${
                          order.gross_margin_percent >= 30 ? 'text-green-600' :
                          order.gross_margin_percent >= 15 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {order.gross_margin_percent >= 30 ? <TrendingUp className="w-4 h-4" /> :
                           order.gross_margin_percent < 15 ? <TrendingDown className="w-4 h-4" /> : null}
                          {order.gross_margin_percent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No hay órdenes en el período seleccionado</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
