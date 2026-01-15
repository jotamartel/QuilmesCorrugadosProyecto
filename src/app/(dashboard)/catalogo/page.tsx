'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Plus, Box, X } from 'lucide-react';
import { formatM2 } from '@/lib/utils/pricing';
import { formatBoxDimensions } from '@/lib/utils/format';
import type { Box as BoxType } from '@/lib/types/database';

export default function CatalogoPage() {
  const [boxes, setBoxes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [newBox, setNewBox] = useState({
    name: '',
    length_mm: 300,
    width_mm: 200,
    height_mm: 200,
  });

  useEffect(() => {
    fetchBoxes();
  }, []);

  async function fetchBoxes() {
    try {
      const res = await fetch('/api/boxes');
      const data = await res.json();
      setBoxes(data.data || []);
    } catch (error) {
      console.error('Error fetching boxes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!newBox.name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBox),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      setBoxes([...boxes, data]);
      setShowForm(false);
      setNewBox({ name: '', length_mm: 300, width_mm: 200, height_mm: 200 });
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar la caja');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogo de Cajas</h1>
          <p className="text-gray-500">Cajas estandar disponibles para cotizar</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Caja
        </Button>
      </div>

      {/* New Box Form */}
      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Nueva caja</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <Input
                label="Nombre"
                value={newBox.name}
                onChange={(e) => setNewBox({ ...newBox, name: e.target.value })}
                placeholder="Caja 30x20x20"
              />
              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Largo (mm)"
                  type="number"
                  value={newBox.length_mm}
                  onChange={(e) => setNewBox({ ...newBox, length_mm: parseInt(e.target.value) || 0 })}
                  min={200}
                />
                <Input
                  label="Ancho (mm)"
                  type="number"
                  value={newBox.width_mm}
                  onChange={(e) => setNewBox({ ...newBox, width_mm: parseInt(e.target.value) || 0 })}
                  min={200}
                />
                <Input
                  label="Alto (mm)"
                  type="number"
                  value={newBox.height_mm}
                  onChange={(e) => setNewBox({ ...newBox, height_mm: parseInt(e.target.value) || 0 })}
                  min={100}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <LoadingSpinner size="sm" /> : 'Guardar'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* Boxes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {boxes.map((box) => {
          const isOversized = box.length_mm > 600 || box.width_mm > 400 || box.height_mm > 400;

          return (
            <Card key={box.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Box className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{box.name}</h3>
                    <p className="text-sm text-gray-500">
                      {formatBoxDimensions(box.length_mm, box.width_mm, box.height_mm)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Desplegado:</span>
                    <span>{box.unfolded_length_mm} x {box.unfolded_width_mm} mm</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">m2/caja:</span>
                    <span className="font-medium">{formatM2(box.m2_per_box)}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {box.is_standard && (
                    <Badge variant="info">Estandar</Badge>
                  )}
                  {isOversized && (
                    <Badge variant="warning">Especial</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {boxes.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No hay cajas en el catalogo
          </CardContent>
        </Card>
      )}
    </div>
  );
}
