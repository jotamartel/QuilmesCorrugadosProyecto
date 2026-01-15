'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import {
  FileText,
  ShoppingCart,
  TrendingUp,
  Package,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import { QUOTE_STATUS_LABELS, ORDER_STATUS_LABELS, QUOTE_STATUS_COLORS, ORDER_STATUS_COLORS } from '@/lib/utils/format';
import type { Quote, Order, QuoteStatus, OrderStatus } from '@/lib/types/database';

interface DashboardData {
  quotes: Quote[];
  orders: Order[];
  stats: {
    quotes_this_month: number;
    orders_this_month: number;
    conversion_rate: number;
    m2_this_month: number;
    revenue_this_month: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Obtener cotizaciones recientes
        const quotesRes = await fetch('/api/quotes?limit=5');
        const quotesData = await quotesRes.json();

        // Obtener órdenes recientes
        const ordersRes = await fetch('/api/orders?limit=5');
        const ordersData = await ordersRes.json();

        // Obtener reporte de ventas del mes
        const salesRes = await fetch('/api/reports/sales?group_by=month');
        const salesData = await salesRes.json();

        const currentMonth = salesData.data?.[salesData.data.length - 1] || {};

        setData({
          quotes: quotesData.data || [],
          orders: ordersData.data || [],
          stats: {
            quotes_this_month: currentMonth.total_quotes || 0,
            orders_this_month: currentMonth.total_orders || 0,
            conversion_rate: currentMonth.conversion_rate || 0,
            m2_this_month: currentMonth.total_m2 || 0,
            revenue_this_month: currentMonth.total_revenue || 0,
          },
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return <LoadingPage />;
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Error al cargar datos</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Resumen de operaciones</p>
        </div>
        <Link href="/cotizaciones/nueva">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotizacion
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cotizaciones del mes</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.stats.quotes_this_month}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ordenes del mes</p>
                <p className="text-2xl font-bold text-gray-900">
                  {data.stats.orders_this_month}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">m2 vendidos</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatM2(data.stats.m2_this_month)}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Facturacion del mes</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(data.stats.revenue_this_month)}
                </p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Quotes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Cotizaciones Recientes</CardTitle>
            <Link href="/cotizaciones">
              <Button variant="ghost" size="sm">
                Ver todas
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.quotes.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No hay cotizaciones
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.quotes.map((quote) => (
                  <Link
                    key={quote.id}
                    href={`/cotizaciones/${quote.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {quote.quote_number}
                      </p>
                      <p className="text-sm text-gray-500">
                        {(quote.client as { name: string } | null)?.name || 'Sin cliente'} - {formatDate(quote.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {formatCurrency(quote.total)}
                      </p>
                      <Badge className={QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}>
                        {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ordenes Recientes</CardTitle>
            <Link href="/ordenes">
              <Button variant="ghost" size="sm">
                Ver todas
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.orders.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No hay ordenes
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/ordenes/${order.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {order.order_number}
                      </p>
                      <p className="text-sm text-gray-500">
                        {(order.client as { name: string } | null)?.name || 'Sin cliente'} - {formatDate(order.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {formatCurrency(order.total)}
                      </p>
                      <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                        {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones Rapidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/cotizaciones/nueva">
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Cotizacion
              </Button>
            </Link>
            <Link href="/clientes/nuevo">
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Cliente
              </Button>
            </Link>
            <Link href="/catalogo">
              <Button variant="outline">
                <Package className="w-4 h-4 mr-2" />
                Ver Catalogo
              </Button>
            </Link>
            <Link href="/reportes">
              <Button variant="outline">
                <TrendingUp className="w-4 h-4 mr-2" />
                Ver Reportes
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
