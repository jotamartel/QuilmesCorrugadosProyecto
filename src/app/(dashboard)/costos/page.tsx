'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  Wrench,
  Settings,
  Plus,
  ArrowRight,
  AlertTriangle,
  Wallet,
  PieChart,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import Link from 'next/link';
import type { FixedCost, Supply, CostCategory } from '@/lib/types/database';

interface ProductionConfig {
  cardboard_cost_per_m2: number;
  glue_cost_per_m2: number;
  ink_cost_per_m2: number;
  labor_cost_per_m2: number;
  energy_cost_per_m2: number;
  waste_percentage: number;
  overhead_percentage: number;
  total_cost_per_m2: number;
}

interface ExpensesSummary {
  total: number;
  by_category: Record<string, number>;
  count: number;
}

export default function CostosPage() {
  const [loading, setLoading] = useState(true);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [productionConfig, setProductionConfig] = useState<ProductionConfig | null>(null);
  const [expensesSummary, setExpensesSummary] = useState<ExpensesSummary | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [fixedRes, suppliesRes, categoriesRes, configRes, expensesRes] = await Promise.all([
        fetch('/api/costs/fixed'),
        fetch('/api/costs/supplies'),
        fetch('/api/costs/categories'),
        fetch('/api/costs/production-config'),
        fetch('/api/costs/expenses'),
      ]);

      if (fixedRes.ok) setFixedCosts(await fixedRes.json());
      if (suppliesRes.ok) setSupplies(await suppliesRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (configRes.ok) setProductionConfig(await configRes.json());
      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpensesSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching costs data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calcular totales
  const monthlyFixedCosts = fixedCosts.reduce((sum, cost) => {
    let monthly = Number(cost.amount);
    switch (cost.frequency) {
      case 'daily': monthly = monthly * 30; break;
      case 'weekly': monthly = monthly * 4.33; break;
      case 'yearly': monthly = monthly / 12; break;
    }
    return sum + monthly;
  }, 0);

  const lowStockSupplies = supplies.filter(s => s.current_stock <= s.min_stock);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de Costos</h1>
          <p className="text-gray-500">Gestión de costos fijos, variables e insumos</p>
        </div>
        <Link href="/costos/rentabilidad">
          <Button className="gap-2">
            <PieChart className="w-4 h-4" />
            Ver Rentabilidad
          </Button>
        </Link>
      </div>

      {/* Alertas */}
      {lowStockSupplies.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Stock bajo en {lowStockSupplies.length} insumo(s)</p>
            <p className="text-sm text-amber-700">
              {lowStockSupplies.map(s => s.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Costos Fijos (mes)</p>
                <p className="text-2xl font-bold">{formatCurrency(monthlyFixedCosts)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Wallet className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Gastos del Mes</p>
                <p className="text-2xl font-bold">{formatCurrency(expensesSummary?.total || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Costo Prod. / m²</p>
                <p className="text-2xl font-bold">{formatCurrency(productionConfig?.total_cost_per_m2 || 0)}</p>
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
                <p className="text-sm text-gray-500">Insumos Registrados</p>
                <p className="text-2xl font-bold">{supplies.length}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Wrench className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Costos Fijos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Costos Fijos
            </CardTitle>
            <Link href="/costos/fijos">
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Agregar
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {fixedCosts.length > 0 ? (
              <div className="space-y-3">
                {fixedCosts.slice(0, 5).map((cost) => (
                  <div key={cost.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium">{cost.name}</p>
                      <p className="text-sm text-gray-500">
                        {cost.frequency === 'monthly' ? 'Mensual' :
                         cost.frequency === 'yearly' ? 'Anual' :
                         cost.frequency === 'weekly' ? 'Semanal' : 'Diario'}
                      </p>
                    </div>
                    <p className="font-bold">{formatCurrency(cost.amount)}</p>
                  </div>
                ))}
                {fixedCosts.length > 5 && (
                  <Link href="/costos/fijos" className="block text-center text-blue-600 hover:underline text-sm py-2">
                    Ver todos ({fixedCosts.length}) <ArrowRight className="w-4 h-4 inline" />
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No hay costos fijos registrados</p>
            )}
          </CardContent>
        </Card>

        {/* Insumos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Insumos
            </CardTitle>
            <Link href="/costos/insumos">
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Agregar
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {supplies.length > 0 ? (
              <div className="space-y-3">
                {supplies.slice(0, 5).map((supply) => {
                  const isLowStock = supply.current_stock <= supply.min_stock;
                  const priceChange = supply.last_price
                    ? ((supply.current_price - supply.last_price) / supply.last_price) * 100
                    : 0;

                  return (
                    <div key={supply.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{supply.name}</p>
                          <p className="text-sm text-gray-500">{supply.unit}</p>
                        </div>
                        {isLowStock && (
                          <Badge variant="warning" className="text-xs">Stock bajo</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(supply.current_price)}</p>
                        {priceChange !== 0 && (
                          <p className={`text-xs flex items-center justify-end gap-1 ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {priceChange > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {supplies.length > 5 && (
                  <Link href="/costos/insumos" className="block text-center text-blue-600 hover:underline text-sm py-2">
                    Ver todos ({supplies.length}) <ArrowRight className="w-4 h-4 inline" />
                  </Link>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No hay insumos registrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configuración de Producción */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Costos de Producción por m²
          </CardTitle>
          <Link href="/costos/configuracion">
            <Button variant="outline" size="sm" className="gap-1">
              <Settings className="w-4 h-4" />
              Configurar
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {productionConfig ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Cartón</p>
                <p className="font-bold">{formatCurrency(productionConfig.cardboard_cost_per_m2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Pegamento</p>
                <p className="font-bold">{formatCurrency(productionConfig.glue_cost_per_m2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Tintas</p>
                <p className="font-bold">{formatCurrency(productionConfig.ink_cost_per_m2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Mano de Obra</p>
                <p className="font-bold">{formatCurrency(productionConfig.labor_cost_per_m2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Energía</p>
                <p className="font-bold">{formatCurrency(productionConfig.energy_cost_per_m2)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Desperdicio</p>
                <p className="font-bold">{productionConfig.waste_percentage}%</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">TOTAL / m²</p>
                <p className="font-bold text-blue-700">{formatCurrency(productionConfig.total_cost_per_m2)}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Configure los costos de producción</p>
          )}
        </CardContent>
      </Card>

      {/* Gastos por Categoría */}
      {expensesSummary && Object.keys(expensesSummary.by_category).length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Gastos del Mes por Categoría</CardTitle>
            <Link href="/costos/gastos">
              <Button variant="outline" size="sm" className="gap-1">
                Ver Detalle <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(expensesSummary.by_category)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => {
                  const percentage = expensesSummary.total > 0
                    ? (amount / expensesSummary.total) * 100
                    : 0;

                  return (
                    <div key={category} className="flex items-center gap-4">
                      <div className="w-32 text-sm text-gray-600 truncate">{category}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-24 text-right font-medium">{formatCurrency(amount)}</div>
                      <div className="w-12 text-right text-sm text-gray-500">{percentage.toFixed(0)}%</div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
