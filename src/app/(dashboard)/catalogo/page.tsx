'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Plus, Box, X, Download, Upload } from 'lucide-react';
import { formatM2 } from '@/lib/utils/pricing';
import { formatBoxDimensions } from '@/lib/utils/format';
import type { Box as BoxType } from '@/lib/types/database';

// Inline stock editor with debounced save
function StockEditor({ box, onUpdate }: { box: BoxType; onUpdate: (id: string, stock: number) => void }) {
  const [value, setValue] = useState(String(box.stock ?? 0));
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const save = useCallback((val: string) => {
    const num = parseInt(val);
    if (!isNaN(num) && num >= 0) {
      onUpdate(box.id, num);
    }
  }, [box.id, onUpdate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(v), 800);
  };

  const handleBlur = () => {
    clearTimeout(timerRef.current);
    save(value);
  };

  const stock = parseInt(value) || 0;
  const badgeColor = stock === 0
    ? 'bg-red-100 text-red-700'
    : stock < 10
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700';

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badgeColor}`}>
        {stock === 0 ? 'Sin stock' : stock < 10 ? 'Bajo' : 'OK'}
      </span>
    </div>
  );
}

export default function CatalogoPage() {
  const [boxes, setBoxes] = useState<BoxType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importStatus, setImportStatus] = useState<{ show: boolean; message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [newBox, setNewBox] = useState({
    name: '',
    length_mm: 300,
    width_mm: 200,
    height_mm: 200,
    stock: 0,
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

  // Update stock via PATCH
  const updateStock = useCallback(async (id: string, stock: number) => {
    try {
      const res = await fetch(`/api/boxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock }),
      });
      if (res.ok) {
        setBoxes(prev => prev.map(b => b.id === id ? { ...b, stock } : b));
      }
    } catch (error) {
      console.error('Error updating stock:', error);
    }
  }, []);

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
      setNewBox({ name: '', length_mm: 300, width_mm: 200, height_mm: 200, stock: 0 });
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar la caja');
    } finally {
      setSaving(false);
    }
  }

  // CSV import handler
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await fetch('/api/boxes/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      const data = await res.json();

      if (!res.ok) {
        setImportStatus({ show: true, message: data.error || 'Error al importar', type: 'error' });
        return;
      }

      const parts: string[] = [];
      if (data.created > 0) parts.push(`${data.created} creadas`);
      if (data.duplicates > 0) parts.push(`${data.duplicates} duplicadas`);
      if (data.errors?.length > 0) parts.push(`${data.errors.length} errores`);

      setImportStatus({
        show: true,
        message: parts.join(', ') || 'Sin cambios',
        type: data.created > 0 ? 'success' : 'error',
      });

      // Refresh list
      if (data.created > 0) {
        fetchBoxes();
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      setImportStatus({ show: true, message: 'Error al importar el archivo', type: 'error' });
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => window.location.href = '/api/boxes/export-csv'}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
          />
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Caja
          </Button>
        </div>
      </div>

      {/* Import status banner */}
      {importStatus?.show && (
        <div
          className={`rounded-lg p-3 text-sm flex items-center justify-between ${
            importStatus.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{importStatus.message}</span>
          <button
            onClick={() => setImportStatus(null)}
            className="ml-3 text-current opacity-60 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Stock inicial"
                  type="number"
                  value={newBox.stock}
                  onChange={(e) => setNewBox({ ...newBox, stock: parseInt(e.target.value) || 0 })}
                  min={0}
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
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Stock:</span>
                    <StockEditor box={box} onUpdate={updateStock} />
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
