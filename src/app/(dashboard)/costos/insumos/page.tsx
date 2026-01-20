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
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import Link from 'next/link';
import type { Supply, CostCategory } from '@/lib/types/database';

export default function InsumosPage() {
  const [loading, setLoading] = useState(true);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    unit: '',
    current_price: '',
    supplier: '',
    min_stock: '',
    current_stock: '',
    category_id: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [suppliesRes, categoriesRes] = await Promise.all([
        fetch('/api/costs/supplies?active=false'),
        fetch('/api/costs/categories'),
      ]);

      if (suppliesRes.ok) setSupplies(await suppliesRes.json());
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
      unit: '',
      current_price: '',
      supplier: '',
      min_stock: '',
      current_stock: '',
      category_id: '',
      notes: '',
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(supply: Supply) {
    setFormData({
      name: supply.name,
      description: supply.description || '',
      unit: supply.unit,
      current_price: supply.current_price.toString(),
      supplier: supply.supplier || '',
      min_stock: supply.min_stock.toString(),
      current_stock: supply.current_stock.toString(),
      category_id: supply.category_id || '',
      notes: supply.notes || '',
    });
    setEditingId(supply.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      ...formData,
      current_price: parseFloat(formData.current_price),
      min_stock: formData.min_stock ? parseFloat(formData.min_stock) : 0,
      current_stock: formData.current_stock ? parseFloat(formData.current_stock) : 0,
      category_id: formData.category_id || null,
    };

    try {
      const url = editingId ? `/api/costs/supplies/${editingId}` : '/api/costs/supplies';
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
      console.error('Error saving supply:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este insumo?')) return;

    try {
      const res = await fetch(`/api/costs/supplies/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error deleting supply:', error);
    }
  }

  const lowStockCount = supplies.filter(s => s.current_stock <= s.min_stock && s.is_active).length;

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
            <h1 className="text-2xl font-bold text-gray-900">Insumos y Materiales</h1>
            <p className="text-gray-500">
              {supplies.filter(s => s.is_active).length} insumos activos
              {lowStockCount > 0 && (
                <span className="text-amber-600 ml-2">
                  • {lowStockCount} con stock bajo
                </span>
              )}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo Insumo
        </Button>
      </div>

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? 'Editar Insumo' : 'Nuevo Insumo'}</CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nombre *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Cartón corrugado BC"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Unidad de medida *</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Ej: kg, m2, litro, unidad"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Precio actual *</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.current_price}
                    onChange={(e) => setFormData({ ...formData, current_price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Proveedor</label>
                  <Input
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock mínimo</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.min_stock}
                    onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock actual</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoría</label>
                  <Select
                    options={[
                      { value: '', label: 'Sin categoría' },
                      ...categories
                        .filter(c => c.type === 'supply')
                        .map(c => ({ value: c.id, label: c.name }))
                    ]}
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
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
                  {editingId ? 'Guardar Cambios' : 'Crear Insumo'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de insumos */}
      <Card>
        <CardContent className="p-0">
          {supplies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="px-6 py-3">Insumo</th>
                    <th className="px-6 py-3">Proveedor</th>
                    <th className="px-6 py-3 text-right">Precio</th>
                    <th className="px-6 py-3">Variación</th>
                    <th className="px-6 py-3 text-right">Stock</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supplies.map((supply) => {
                    const isLowStock = supply.current_stock <= supply.min_stock;
                    const priceChange = supply.last_price
                      ? ((supply.current_price - supply.last_price) / supply.last_price) * 100
                      : 0;

                    return (
                      <tr key={supply.id} className={`hover:bg-gray-50 ${!supply.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-6 py-4">
                          <p className="font-medium">{supply.name}</p>
                          <p className="text-sm text-gray-500">{supply.unit}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {supply.supplier || '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-medium">{formatCurrency(supply.current_price)}</p>
                          <p className="text-xs text-gray-400">/{supply.unit}</p>
                        </td>
                        <td className="px-6 py-4">
                          {priceChange !== 0 ? (
                            <span className={`flex items-center gap-1 text-sm ${priceChange > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {priceChange > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isLowStock && supply.is_active && (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                            <span className={isLowStock && supply.is_active ? 'text-amber-600 font-medium' : ''}>
                              {supply.current_stock} {supply.unit}
                            </span>
                          </div>
                          {supply.min_stock > 0 && (
                            <p className="text-xs text-gray-400">Mín: {supply.min_stock}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={supply.is_active ? 'success' : 'default'}>
                            {supply.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(supply)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(supply.id)}
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
            <p className="text-gray-500 text-center py-12">No hay insumos registrados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
