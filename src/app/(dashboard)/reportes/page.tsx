'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingPage } from '@/components/ui/loading';
import { DateRangePicker, DateRange } from '@/components/ui/date-range-picker';
import {
  BarChart3,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  ArrowUpRight,
  Target,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  FileText,
} from 'lucide-react';
import {
  exportSalesReport,
  exportProductionReport,
  exportClientsReport,
  exportPrecisionReport,
  exportFullReport,
} from '@/lib/pdf';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/types/database';
import { format, startOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface SalesData {
  period: string;
  total_quotes: number;
  total_orders: number;
  total_m2: number;
  total_revenue: number;
  conversion_rate: number;
}

interface ProductionData {
  status: OrderStatus;
  status_label: string;
  count: number;
  total_m2: number;
}

interface TopClientData {
  rank: number;
  client_id: string;
  client_name: string;
  company: string | null;
  total_orders: number;
  total_m2: number;
  total_revenue: number;
}

interface PrecisionData {
  order_id: string;
  order_number: string;
  client_name: string;
  client_company: string | null;
  confirmed_at: string;
  original_m2: number;
  delivered_m2: number;
  precision_percent: number;
  difference_m2: number;
}

interface PrecisionSummary {
  total_orders: number;
  average_precision: number;
  total_original_m2: number;
  total_delivered_m2: number;
  total_difference_m2: number;
  perfect_orders: number;
  under_delivered: number;
  over_delivered: number;
  precision_ranges: {
    perfect: number;
    above_98: number;
    above_95: number;
    above_90: number;
    below_90: number;
  };
}

const periodOptions = [
  { value: 'day', label: 'Por dia' },
  { value: 'week', label: 'Por semana' },
  { value: 'month', label: 'Por mes' },
];

// Rango de fechas por defecto: últimos 3 meses
const getDefaultDateRange = (): DateRange => ({
  from: startOfMonth(subMonths(new Date(), 2)),
  to: new Date(),
});

export default function ReportesPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [salesData, setSalesData] = useState<{
    data: SalesData[];
    summary: {
      total_quotes: number;
      total_orders: number;
      total_m2: number;
      total_revenue: number;
      conversion_rate: number;
    };
  } | null>(null);
  const [productionData, setProductionData] = useState<{
    data: ProductionData[];
    summary: {
      pending_m2: number;
      in_production_m2: number;
      completed_m2: number;
      total_orders: number;
    };
  } | null>(null);
  const [topClients, setTopClients] = useState<{
    data: TopClientData[];
    summary: {
      total_clients: number;
      top_clients_percentage: number;
    };
  } | null>(null);
  const [precisionData, setPrecisionData] = useState<{
    data: PrecisionData[];
    summary: PrecisionSummary;
  } | null>(null);

  useEffect(() => {
    fetchReports();
  }, [period, dateRange]);

  async function fetchReports() {
    setLoading(true);
    try {
      const fromDate = format(dateRange.from, 'yyyy-MM-dd');
      const toDate = format(dateRange.to, 'yyyy-MM-dd');

      const [salesRes, productionRes, clientsRes, precisionRes] = await Promise.all([
        fetch(`/api/reports/sales?group_by=${period}&from=${fromDate}&to=${toDate}`),
        fetch('/api/reports/production'),
        fetch(`/api/reports/clients?limit=10&from=${fromDate}&to=${toDate}`),
        fetch(`/api/reports/precision?limit=20&start_date=${fromDate}&end_date=${toDate}`),
      ]);

      if (salesRes.ok) setSalesData(await salesRes.json());
      if (productionRes.ok) setProductionData(await productionRes.json());
      if (clientsRes.ok) setTopClients(await clientsRes.json());
      if (precisionRes.ok) setPrecisionData(await precisionRes.json());
    } catch (error) {
      console.error('Error fetching reports:', error);
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
            <p className="text-gray-500">Análisis de ventas y producción</p>
          </div>
          <Button
            onClick={() => exportFullReport(
              salesData,
              topClients ? {
                data: topClients.data.map(c => ({
                  client_name: c.client_name,
                  company: c.company,
                  total_orders: c.total_orders,
                  total_m2: c.total_m2,
                  total_revenue: c.total_revenue,
                })),
                summary: topClients.summary,
              } : null,
              precisionData ? {
                data: precisionData.data.map(p => ({
                  order_number: p.order_number,
                  client_name: p.client_name,
                  original_m2: p.original_m2,
                  delivered_m2: p.delivered_m2,
                  precision_percent: p.precision_percent,
                  difference_m2: p.difference_m2,
                })),
                summary: precisionData.summary,
              } : null,
              productionData ? {
                data: productionData.data.map(d => ({
                  status: d.status,
                  status_label: ORDER_STATUS_LABELS[d.status],
                  count: d.count,
                  total_m2: d.total_m2,
                })),
                summary: productionData.summary,
              } : null,
              period,
              dateRange
            )}
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            Exportar Reporte Completo
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Rango de fechas
            </label>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agrupar por
            </label>
            <Select
              options={periodOptions}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
        </div>

        {/* Info del rango seleccionado */}
        <div className="text-sm text-gray-600 bg-blue-50 px-4 py-2 rounded-lg">
          Mostrando datos desde <span className="font-semibold">{format(dateRange.from, "d 'de' MMMM yyyy", { locale: es })}</span> hasta <span className="font-semibold">{format(dateRange.to, "d 'de' MMMM yyyy", { locale: es })}</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cotizaciones</p>
                <p className="text-2xl font-bold">{salesData?.summary.total_quotes || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ordenes</p>
                <p className="text-2xl font-bold">{salesData?.summary.total_orders || 0}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">m2 vendidos</p>
                <p className="text-2xl font-bold">{formatM2(salesData?.summary.total_m2 || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Facturación</p>
                <p className="text-2xl font-bold">{formatCurrency(salesData?.summary.total_revenue || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales by Period */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ventas por periodo</CardTitle>
            {salesData?.data && salesData.data.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportSalesReport(salesData.data, salesData.summary, period, dateRange)}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {salesData?.data && salesData.data.length > 0 ? (
              <div className="space-y-3">
                {salesData.data.slice(-6).map((item, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className="w-24 text-sm text-gray-500">{item.period}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="h-6 bg-blue-500 rounded"
                          style={{
                            width: `${Math.min(100, (item.total_revenue / (salesData.summary.total_revenue || 1)) * 100 * 2)}%`
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(item.total_revenue)}</p>
                      <p className="text-xs text-gray-500">{item.total_orders} ordenes</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Sin datos disponibles</p>
            )}
          </CardContent>
        </Card>

        {/* Production Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Estado de produccion</CardTitle>
            {productionData?.data && productionData.data.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportProductionReport(
                  productionData.data.map(d => ({ ...d, total_revenue: 0 })),
                  { ...productionData.summary, pending_count: 0, in_production_count: 0, completed_count: 0, total_m2: 0 }
                )}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {productionData?.data && productionData.data.length > 0 ? (
              <div className="space-y-4">
                {productionData.data.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        item.status === 'delivered' ? 'bg-emerald-500' :
                        item.status === 'shipped' ? 'bg-purple-500' :
                        item.status === 'ready' ? 'bg-green-500' :
                        item.status === 'in_production' ? 'bg-orange-500' :
                        item.status === 'confirmed' ? 'bg-blue-500' :
                        'bg-yellow-500'
                      }`} />
                      <span className="text-sm">{ORDER_STATUS_LABELS[item.status]}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{item.count}</span>
                      <span className="text-gray-500 text-sm ml-2">({formatM2(item.total_m2)} m2)</span>
                    </div>
                  </div>
                ))}
                <div className="pt-4 border-t">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-sm text-gray-500">Pendiente</p>
                      <p className="font-bold">{formatM2(productionData.summary.pending_m2)} m2</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">En producción</p>
                      <p className="font-bold">{formatM2(productionData.summary.in_production_m2)} m2</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Completado</p>
                      <p className="font-bold">{formatM2(productionData.summary.completed_m2)} m2</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Sin datos disponibles</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Clients */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Top 10 Clientes
          </CardTitle>
          <div className="flex items-center gap-4">
            {topClients?.summary && (
              <div className="text-sm text-gray-500">
                {topClients.summary.top_clients_percentage.toFixed(1)}% del total
              </div>
            )}
            {topClients?.data && topClients.data.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportClientsReport(
                  topClients.data.map(c => ({
                    client_name: c.client_name,
                    company: c.company,
                    total_orders: c.total_orders,
                    total_m2: c.total_m2,
                    total_revenue: c.total_revenue,
                  })),
                  topClients.summary,
                  dateRange
                )}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {topClients?.data && topClients.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-3">#</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3 text-right">Ordenes</th>
                    <th className="pb-3 text-right">m2</th>
                    <th className="pb-3 text-right">Facturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topClients.data.map((client) => (
                    <tr key={client.client_id} className="hover:bg-gray-50">
                      <td className="py-3 text-gray-500">{client.rank}</td>
                      <td className="py-3">
                        <div>
                          <p className="font-medium">{client.client_name}</p>
                          {client.company && (
                            <p className="text-sm text-gray-500">{client.company}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right">{client.total_orders}</td>
                      <td className="py-3 text-right">{formatM2(client.total_m2)}</td>
                      <td className="py-3 text-right font-medium">
                        {formatCurrency(client.total_revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">Sin datos disponibles</p>
          )}
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Tasa de conversion</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-8 py-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-blue-600">
                {salesData?.summary.total_quotes || 0}
              </p>
              <p className="text-sm text-gray-500">Cotizaciones</p>
            </div>
            <ArrowUpRight className="w-8 h-8 text-gray-300" />
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600">
                {salesData?.summary.total_orders || 0}
              </p>
              <p className="text-sm text-gray-500">Ordenes</p>
            </div>
            <div className="ml-8 text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-3xl font-bold text-gray-900">
                {(salesData?.summary.conversion_rate || 0).toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500">Tasa de conversion</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Precisión de Producción */}
      {precisionData && precisionData.summary.total_orders > 0 && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Precision de Produccion
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportPrecisionReport(
                  precisionData.data.map(p => ({
                    order_number: p.order_number,
                    client_name: p.client_name,
                    original_m2: p.original_m2,
                    delivered_m2: p.delivered_m2,
                    precision_percent: p.precision_percent,
                    difference_m2: p.difference_m2,
                  })),
                  precisionData.summary,
                  dateRange
                )}
              >
                <Download className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Precisión promedio */}
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className={`text-4xl font-bold ${
                    precisionData.summary.average_precision >= 98 ? 'text-green-600' :
                    precisionData.summary.average_precision >= 95 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {precisionData.summary.average_precision.toFixed(1)}%
                  </p>
                  <p className="text-sm text-gray-500">Precisión promedio</p>
                </div>

                {/* Órdenes perfectas */}
                <div className="text-center p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <p className="text-2xl font-bold text-green-600">
                      {precisionData.summary.perfect_orders}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500">Entregas exactas</p>
                </div>

                {/* Entregó menos */}
                <div className="text-center p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <p className="text-2xl font-bold text-red-600">
                      {precisionData.summary.under_delivered}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500">Entregó menos</p>
                </div>

                {/* Entregó más */}
                <div className="text-center p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    <p className="text-2xl font-bold text-blue-600">
                      {precisionData.summary.over_delivered}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500">Entregó más</p>
                </div>
              </div>

              {/* Distribución por rangos */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-medium text-gray-700 mb-4">Distribución por precisión</h4>
                <div className="space-y-3">
                  {[
                    { label: '100% (Exacto)', value: precisionData.summary.precision_ranges.perfect, color: 'bg-green-500' },
                    { label: '98-99%', value: precisionData.summary.precision_ranges.above_98, color: 'bg-green-400' },
                    { label: '95-97%', value: precisionData.summary.precision_ranges.above_95, color: 'bg-yellow-400' },
                    { label: '90-94%', value: precisionData.summary.precision_ranges.above_90, color: 'bg-orange-400' },
                    { label: '<90%', value: precisionData.summary.precision_ranges.below_90, color: 'bg-red-400' },
                  ].map((range, idx) => {
                    const percent = precisionData.summary.total_orders > 0
                      ? (range.value / precisionData.summary.total_orders) * 100
                      : 0;
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-20 text-sm text-gray-600">{range.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div
                            className={`h-full ${range.color} transition-all`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="w-16 text-right">
                          <span className="font-medium">{range.value}</span>
                          <span className="text-gray-400 text-sm ml-1">({percent.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumen de m2 */}
              <div className="mt-6 pt-6 border-t grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-500">m2 cotizados</p>
                  <p className="font-bold">{formatM2(precisionData.summary.total_original_m2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">m2 entregados</p>
                  <p className="font-bold">{formatM2(precisionData.summary.total_delivered_m2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Diferencia</p>
                  <p className={`font-bold ${
                    precisionData.summary.total_difference_m2 >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {precisionData.summary.total_difference_m2 >= 0 ? '+' : ''}
                    {formatM2(precisionData.summary.total_difference_m2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Historial de precisión */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de entregas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase">
                      <th className="pb-3">Orden</th>
                      <th className="pb-3">Cliente</th>
                      <th className="pb-3 text-right">Cotizado</th>
                      <th className="pb-3 text-right">Entregado</th>
                      <th className="pb-3 text-right">Diferencia</th>
                      <th className="pb-3 text-right">Precisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {precisionData.data.slice(0, 10).map((item) => (
                      <tr key={item.order_id} className="hover:bg-gray-50">
                        <td className="py-3">
                          <a
                            href={`/ordenes/${item.order_id}`}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {item.order_number}
                          </a>
                        </td>
                        <td className="py-3">
                          <p className="font-medium">{item.client_name}</p>
                          {item.client_company && (
                            <p className="text-sm text-gray-500">{item.client_company}</p>
                          )}
                        </td>
                        <td className="py-3 text-right text-gray-600">
                          {formatM2(item.original_m2)}
                        </td>
                        <td className="py-3 text-right font-medium">
                          {formatM2(item.delivered_m2)}
                        </td>
                        <td className="py-3 text-right">
                          <span className={
                            item.difference_m2 === 0 ? 'text-gray-400' :
                            item.difference_m2 > 0 ? 'text-green-600' : 'text-red-600'
                          }>
                            {item.difference_m2 === 0 ? '-' :
                              `${item.difference_m2 > 0 ? '+' : ''}${formatM2(item.difference_m2)}`}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-bold ${
                            item.precision_percent >= 100 ? 'text-green-600' :
                            item.precision_percent >= 98 ? 'text-green-500' :
                            item.precision_percent >= 95 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {item.precision_percent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
