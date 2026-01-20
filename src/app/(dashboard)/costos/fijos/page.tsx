'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingPage } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  ArrowLeft,
  Edit2,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import Link from 'next/link';
import type { FixedCost, CostCategory, CostFrequency } from '@/lib/types/database';
import { COST_FREQUENCY_LABELS } from '@/lib/types/database';

const frequencyOptions = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
];

export default function CostosFijosPage() {
  const [loading, setLoading] = useState(true);
  const [costs, setCosts] = useState<FixedCost[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    amount: '',
    frequency: 'monthly' as CostFrequency,
    category_id: '',
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [costsRes, categoriesRes] = await Promise.all([
        fetch('/api/costs/fixed?active=false'),
        fetch('/api/costs/categories'),
      ]);

      if (costsRes.ok) setCosts(await costsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      description: '',
      amount: '',
      frequency: 'monthly',
      category_id: '',
      start_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(cost: FixedCost) {
    setFormData({
      name: cost.name,
      description: cost.description || '',
      amount: cost.amount.toString(),
      frequency: cost.frequency,
      category_id: cost.category_id || '',
      start_date: cost.start_date,
      notes: cost.notes || '',
    });
    setEditingId(cost.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      ...formData,
      amount: parseFloat(formData.amount),
      category_id: formData.category_id || null,
    };

    try {
      const url = editingId ? `/api/costs/fixed/${editingId}` : '/api/costs/fixed';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        resetForm();
        fetchData();
      }
    } catch (error) {
      console.error('Error saving cost:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este costo fijo?')) return;

    try {
      const res = await fetch(`/api/costs/fixed/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error deleting cost:', error);
    }
  }

  async function toggleActive(cost: FixedCost) {
    try {
      await fetch(`/api/costs/fixed/${cost.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !cost.is_active }),
      });
      fetchData();
    } catch (error) {
      console.error('Error toggling cost:', error);
    }
  }

  const totalMonthly = costs
    .filter(c => c.is_active)
    .reduce((sum, cost) => {
      let monthly = Number(cost.amount);
      switch (cost.frequency) {
        case 'daily': monthly = monthly * 30; break;
        case 'weekly': monthly = monthly * 4.33; break;
        case 'yearly': monthly = monthly / 12; break;
      }
      return sum + monthly;
    }, 0);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/costos">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Costos Fijos</h1>
            <p className="text-gray-500">Total mensual: {formatCurrency(totalMonthly)}</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Costo Fijo
        </Button>
      </div>

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? 'Editar Costo Fijo' : 'Nuevo Costo Fijo'}</CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Alquiler de planta"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoría</label>
                  <Select
                    options={[
                      { value: '', label: 'Sin categoría' },
                      ...categories
                        .filter(c => c.type === 'fixed')
                        .map(c => ({ value: c.id, label: c.name }))
                    ]}
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Monto *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Frecuencia *</label>
                  <Select
                    options={frequencyOptions}
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as CostFrequency })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha de inicio *</label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Descripción</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descripción opcional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" className="gap-2">
                  <Save className="w-4 h-4" />
                  {editingId ? 'Guardar Cambios' : 'Crear Costo'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de costos */}
      <Card>
        <CardContent className="p-0">
          {costs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="px-6 py-3">Nombre</th>
                    <th className="px-6 py-3">Categoría</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3">Frecuencia</th>
                    <th className="px-6 py-3 text-right">Mensual</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costs.map((cost) => {
                    let monthly = Number(cost.amount);
                    switch (cost.frequency) {
                      case 'daily': monthly = monthly * 30; break;
                      case 'weekly': monthly = monthly * 4.33; break;
                      case 'yearly': monthly = monthly / 12; break;
                    }

                    return (
                      <tr key={cost.id} className={`hover:bg-gray-50 ${!cost.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-medium">{cost.name}</p>
                          {cost.description && (
                            <p className="text-sm text-gray-500">{cost.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {cost.category?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          {formatCurrency(cost.amount)}
                        </td>
                        <td className="px-6 py-4">
                          {COST_FREQUENCY_LABELS[cost.frequency]}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600">
                          {formatCurrency(monthly)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => toggleActive(cost)}
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                              cost.is_active
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {cost.is_active ? 'Activo' : 'Inactivo'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(cost)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(cost.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-12">No hay costos fijos registrados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
