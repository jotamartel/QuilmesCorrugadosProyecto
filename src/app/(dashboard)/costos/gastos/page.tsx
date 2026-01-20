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
  Calendar,
  Receipt,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import Link from 'next/link';
import type { OperationalExpense, CostCategory } from '@/lib/types/database';

export default function GastosPage() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [summary, setSummary] = useState({ total: 0, count: 0, by_category: [] as { category_id: string; category_name: string; total: number; count: number }[] });

  // Filtros
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [formData, setFormData] = useState({
    concept: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    category_id: '',
    payment_method: '',
    receipt_number: '',
    supplier: '',
    notes: '',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [filterMonth]);

  async function fetchCategories() {
    try {
      const res = await fetch('/api/costs/categories');
      if (res.ok) setCategories(await res.json());
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }

  async function fetchExpenses() {
    setLoading(true);
    try {
      const [year, month] = filterMonth.split('-');
      const from = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const to = `${year}-${month}-${lastDay}`;

      const res = await fetch(`/api/costs/expenses?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses || []);
        setSummary(data.summary || { total: 0, count: 0, by_category: [] });
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      concept: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      category_id: '',
      payment_method: '',
      receipt_number: '',
      supplier: '',
      notes: '',
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(expense: OperationalExpense) {
    setFormData({
      concept: expense.concept,
      amount: expense.amount.toString(),
      expense_date: expense.expense_date,
      category_id: expense.category_id || '',
      payment_method: expense.payment_method || '',
      receipt_number: expense.receipt_number || '',
      supplier: expense.supplier || '',
      notes: expense.notes || '',
    });
    setEditingId(expense.id);
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
      const url = editingId ? `/api/costs/expenses/${editingId}` : '/api/costs/expenses';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        resetForm();
        fetchExpenses();
      }
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return;

    try {
      const res = await fetch(`/api/costs/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  }

  const paymentMethods = [
    { value: '', label: 'Sin especificar' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'tarjeta', label: 'Tarjeta' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'otro', label: 'Otro' },
  ];

  if (loading && expenses.length === 0) {
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
            <h1 className="text-2xl font-bold text-gray-900">Gastos Operativos</h1>
            <p className="text-gray-500">
              {summary.count} gastos en el período • Total: {formatCurrency(summary.total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="w-auto"
          />
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* Resumen por categoría */}
      {summary.by_category.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.by_category.map((cat) => (
            <Card key={cat.category_id || 'sin-cat'}>
              <CardContent className="pt-4">
                <p className="text-sm text-gray-500">{cat.category_name}</p>
                <p className="text-xl font-bold">{formatCurrency(cat.total)}</p>
                <p className="text-xs text-gray-400">{cat.count} gastos</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? 'Editar Gasto' : 'Nuevo Gasto'}</CardTitle>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Concepto *</label>
                  <Input
                    value={formData.concept}
                    onChange={(e) => setFormData({ ...formData, concept: e.target.value })}
                    placeholder="Ej: Compra de insumos de oficina"
                    required
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
                  <label className="block text-sm font-medium mb-1">Fecha *</label>
                  <Input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoría</label>
                  <Select
                    options={[
                      { value: '', label: 'Sin categoría' },
                      ...categories
                        .filter(c => c.type === 'variable' || c.type === 'other')
                        .map(c => ({ value: c.id, label: c.name }))
                    ]}
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Método de pago</label>
                  <Select
                    options={paymentMethods}
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nº Comprobante</label>
                  <Input
                    value={formData.receipt_number}
                    onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                    placeholder="Ej: FC-0001-00012345"
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
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Notas</label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" className="gap-2">
                  <Save className="w-4 h-4" />
                  {editingId ? 'Guardar Cambios' : 'Registrar Gasto'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de gastos */}
      <Card>
        <CardContent className="p-0">
          {expenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Concepto</th>
                    <th className="px-6 py-3">Categoría</th>
                    <th className="px-6 py-3">Proveedor</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3">Pago</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>{new Date(expense.expense_date).toLocaleDateString('es-AR')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">{expense.concept}</p>
                        {expense.receipt_number && (
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <Receipt className="w-3 h-3" />
                            {expense.receipt_number}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {expense.category ? (
                          <Badge variant="default">{expense.category.name}</Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {expense.supplier || '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-6 py-4">
                        {expense.payment_method ? (
                          <Badge variant="info" className="capitalize">
                            {expense.payment_method}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(expense)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(expense.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-12">No hay gastos registrados en este período</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
