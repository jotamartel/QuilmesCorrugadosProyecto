'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Save,
  Calculator,
  Settings,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import Link from 'next/link';
import type { ProductionCostConfig } from '@/lib/types/database';

interface ConfigWithTotal extends ProductionCostConfig {
  total_cost_per_m2?: number;
}

export default function ConfiguracionCostosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<ConfigWithTotal[]>([]);
  const [activeConfig, setActiveConfig] = useState<ConfigWithTotal | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cardboard_cost_per_m2: '',
    glue_cost_per_m2: '',
    ink_cost_per_m2: '',
    labor_cost_per_m2: '',
    energy_cost_per_m2: '',
    waste_percentage: '',
    overhead_percentage: '',
    notes: '',
  });

  useEffect(() => {
    fetchConfigs();
  }, []);

  async function fetchConfigs() {
    setLoading(true);
    try {
      const res = await fetch('/api/costs/production-config');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
        const active = data.find((c: ConfigWithTotal) => c.is_active && !c.effective_to);
        if (active) {
          setActiveConfig(active);
          setFormData({
            name: active.name,
            cardboard_cost_per_m2: active.cardboard_cost_per_m2.toString(),
            glue_cost_per_m2: active.glue_cost_per_m2.toString(),
            ink_cost_per_m2: active.ink_cost_per_m2.toString(),
            labor_cost_per_m2: active.labor_cost_per_m2.toString(),
            energy_cost_per_m2: active.energy_cost_per_m2.toString(),
            waste_percentage: active.waste_percentage.toString(),
            overhead_percentage: active.overhead_percentage.toString(),
            notes: active.notes || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching configs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name: formData.name || `Configuración ${new Date().toLocaleDateString('es-AR')}`,
      cardboard_cost_per_m2: parseFloat(formData.cardboard_cost_per_m2) || 0,
      glue_cost_per_m2: parseFloat(formData.glue_cost_per_m2) || 0,
      ink_cost_per_m2: parseFloat(formData.ink_cost_per_m2) || 0,
      labor_cost_per_m2: parseFloat(formData.labor_cost_per_m2) || 0,
      energy_cost_per_m2: parseFloat(formData.energy_cost_per_m2) || 0,
      waste_percentage: parseFloat(formData.waste_percentage) || 0,
      overhead_percentage: parseFloat(formData.overhead_percentage) || 0,
      notes: formData.notes || null,
    };

    try {
      const res = await fetch('/api/costs/production-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        fetchConfigs();
      }
    } catch (error) {
      console.error('Error saving config:', error);
    } finally {
      setSaving(false);
    }
  }

  // Cálculo en tiempo real
  const calculateTotal = () => {
    const cardboard = parseFloat(formData.cardboard_cost_per_m2) || 0;
    const glue = parseFloat(formData.glue_cost_per_m2) || 0;
    const ink = parseFloat(formData.ink_cost_per_m2) || 0;
    const labor = parseFloat(formData.labor_cost_per_m2) || 0;
    const energy = parseFloat(formData.energy_cost_per_m2) || 0;
    const waste = parseFloat(formData.waste_percentage) || 0;
    const overhead = parseFloat(formData.overhead_percentage) || 0;

    const baseCost = cardboard + glue + ink + labor + energy;
    const wasteAmount = baseCost * (waste / 100);
    const overheadAmount = baseCost * (overhead / 100);

    return {
      baseCost,
      wasteAmount,
      overheadAmount,
      total: baseCost + wasteAmount + overheadAmount,
    };
  };

  const calculated = calculateTotal();

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/costos">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración de Costos de Producción</h1>
          <p className="text-gray-500">
            Define los costos base por m² para calcular la rentabilidad
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Costos por m²
              </CardTitle>
              <CardDescription>
                Estos valores se utilizan para estimar el costo de producción cuando no hay costos directos registrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre de configuración</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Configuración Enero 2025"
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">Costos Directos (por m²)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Cartón</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.cardboard_cost_per_m2}
                        onChange={(e) => setFormData({ ...formData, cardboard_cost_per_m2: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pegamento</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.glue_cost_per_m2}
                        onChange={(e) => setFormData({ ...formData, glue_cost_per_m2: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Tinta</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.ink_cost_per_m2}
                        onChange={(e) => setFormData({ ...formData, ink_cost_per_m2: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Mano de obra</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.labor_cost_per_m2}
                        onChange={(e) => setFormData({ ...formData, labor_cost_per_m2: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Energía</label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.energy_cost_per_m2}
                        onChange={(e) => setFormData({ ...formData, energy_cost_per_m2: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">Ajustes Porcentuales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">% Desperdicio</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.waste_percentage}
                        onChange={(e) => setFormData({ ...formData, waste_percentage: e.target.value })}
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">Material perdido en el proceso</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">% Gastos generales (overhead)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.overhead_percentage}
                        onChange={(e) => setFormData({ ...formData, overhead_percentage: e.target.value })}
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-500 mt-1">Administración, mantenimiento, etc.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notas</label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas o justificación de los valores"
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving} className="gap-2">
                    <Save className="w-4 h-4" />
                    {saving ? 'Guardando...' : 'Guardar Nueva Configuración'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral con cálculo */}
        <div className="space-y-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Calculator className="w-5 h-5" />
                Cálculo en Tiempo Real
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Costo base (materiales + MO):</span>
                  <span className="font-medium">{formatCurrency(calculated.baseCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+ Desperdicio ({formData.waste_percentage || 0}%):</span>
                  <span className="font-medium">{formatCurrency(calculated.wasteAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>+ Overhead ({formData.overhead_percentage || 0}%):</span>
                  <span className="font-medium">{formatCurrency(calculated.overheadAmount)}</span>
                </div>
                <hr className="border-blue-200" />
                <div className="flex justify-between text-lg font-bold text-blue-900">
                  <span>Costo Total por m²:</span>
                  <span>{formatCurrency(calculated.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {activeConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Configuración Activa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{activeConfig.name}</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(activeConfig.total_cost_per_m2 || 0)}/m²
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Desde: {new Date(activeConfig.effective_from).toLocaleDateString('es-AR')}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4" />
                Información
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>
                Al guardar una nueva configuración, la anterior se marca como histórica
                y la nueva se activa automáticamente.
              </p>
              <p>
                Los cálculos de rentabilidad usarán siempre la configuración activa
                para estimar costos de órdenes sin costos directos registrados.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Historial de configuraciones */}
      {configs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de Configuraciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2 text-right">Costo/m²</th>
                    <th className="px-4 py-2">Desde</th>
                    <th className="px-4 py-2">Hasta</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {configs.map((config) => (
                    <tr key={config.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{config.name}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(config.total_cost_per_m2 || 0)}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(config.effective_from).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {config.effective_to
                          ? new Date(config.effective_to).toLocaleDateString('es-AR')
                          : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={config.is_active && !config.effective_to ? 'success' : 'default'}>
                          {config.is_active && !config.effective_to ? 'Activa' : 'Histórica'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
