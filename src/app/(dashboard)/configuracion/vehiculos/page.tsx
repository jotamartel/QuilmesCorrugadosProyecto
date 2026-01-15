'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeader } from '@/components/ui/table';
import { Truck, Plus, Pencil, Trash2, X, Check, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Vehicle } from '@/lib/types/database';

export default function VehiculosPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    patent: '',
    description: '',
    driver_name: '',
    driver_cuit: '',
    is_active: true,
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    try {
      const res = await fetch('/api/vehicles');
      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
      }
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      patent: '',
      description: '',
      driver_name: '',
      driver_cuit: '',
      is_active: true,
    });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(vehicle: Vehicle) {
    setFormData({
      patent: vehicle.patent,
      description: vehicle.description || '',
      driver_name: vehicle.driver_name || '',
      driver_cuit: vehicle.driver_cuit || '',
      is_active: vehicle.is_active,
    });
    setEditingId(vehicle.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingId ? `/api/vehicles/${editingId}` : '/api/vehicles';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      resetForm();
      fetchVehicles();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar el vehiculo');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Desactivar este vehiculo?')) return;

    try {
      const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchVehicles();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/configuracion" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vehiculos</h1>
            <p className="text-gray-500">Administra los vehiculos para despacho y COT</p>
          </div>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo vehiculo
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {editingId ? 'Editar vehiculo' : 'Nuevo vehiculo'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Patente *"
                  value={formData.patent}
                  onChange={(e) => setFormData({ ...formData, patent: e.target.value })}
                  placeholder="ABC123"
                  required
                />
                <Input
                  label="Descripcion"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ej: Camion Mercedes"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nombre del conductor"
                  value={formData.driver_name}
                  onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                />
                <Input
                  label="CUIT del conductor"
                  value={formData.driver_cuit}
                  onChange={(e) => setFormData({ ...formData, driver_cuit: e.target.value })}
                  placeholder="XX-XXXXXXXX-X"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="is_active" className="text-sm">Vehiculo activo</label>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <LoadingSpinner size="sm" /> : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      {editingId ? 'Guardar cambios' : 'Crear vehiculo'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {vehicles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No hay vehiculos registrados</p>
              <p className="text-sm mt-1">Crea el primero haciendo clic en "Nuevo vehiculo"</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patente</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Conductor</TableHead>
                  <TableHead>CUIT Conductor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="font-mono font-medium">{vehicle.patent}</TableCell>
                    <TableCell>{vehicle.description || '-'}</TableCell>
                    <TableCell>{vehicle.driver_name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{vehicle.driver_cuit || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={vehicle.is_active ? 'success' : 'default'}>
                        {vehicle.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(vehicle)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {vehicle.is_active && (
                          <button
                            onClick={() => handleDelete(vehicle.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Desactivar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
