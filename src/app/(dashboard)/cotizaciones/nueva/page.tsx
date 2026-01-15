'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { ClientSearch, CreateClientModal } from '@/components/ui/client-search';
import { Plus, Trash2, Calculator, AlertTriangle, Upload, X, FileText } from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatBoxDimensions } from '@/lib/utils/format';
import type { Client, Box, CalculateQuoteResponse, CalculatedItem } from '@/lib/types/database';

interface QuoteItem {
  id: string;
  box_id?: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
}

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([
    { id: '1', length_mm: 400, width_mm: 300, height_mm: 200, quantity: 1000 }
  ]);
  const [hasPrinting, setHasPrinting] = useState(false);
  const [printingColors, setPrintingColors] = useState(0);
  const [hasExistingPolymer, setHasExistingPolymer] = useState(false);
  const [hasDieCut, setHasDieCut] = useState(false);
  const [notes, setNotes] = useState('');

  // Design file state
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [uploadingDesign, setUploadingDesign] = useState(false);

  // Create client modal
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);

  // Calculation result
  const [calculation, setCalculation] = useState<CalculateQuoteResponse | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientsRes, boxesRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/boxes'),
        ]);

        const clientsData = await clientsRes.json();
        const boxesData = await boxesRes.json();

        setClients(clientsData.data || []);
        setBoxes(boxesData.data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  function addItem() {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        length_mm: 300,
        width_mm: 200,
        height_mm: 200,
        quantity: 1000,
      },
    ]);
  }

  function removeItem(id: string) {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  }

  function updateItem(id: string, field: keyof QuoteItem, value: number | string) {
    setItems(items.map(item => {
      if (item.id !== id) return item;

      if (field === 'box_id' && value) {
        const box = boxes.find(b => b.id === value);
        if (box) {
          return {
            ...item,
            box_id: value as string,
            length_mm: box.length_mm,
            width_mm: box.width_mm,
            height_mm: box.height_mm,
          };
        }
      }

      return { ...item, [field]: value };
    }));
  }

  function handleDesignFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'image/svg+xml'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.svg', '.ai', '.eps', '.psd'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      alert('Tipo de archivo no permitido. Use: JPG, PNG, PDF, SVG, AI, EPS, PSD');
      return;
    }

    // Validar tamaño (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      alert('El archivo es muy grande. Maximo 20MB');
      return;
    }

    setDesignFile(file);

    // Crear preview si es imagen
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setDesignPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setDesignPreview(null);
    }
  }

  function removeDesignFile() {
    setDesignFile(null);
    setDesignPreview(null);
  }

  async function calculateQuote() {
    setCalculating(true);
    try {
      const client = clients.find(c => c.id === clientId);

      const res = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            length_mm: item.length_mm,
            width_mm: item.width_mm,
            height_mm: item.height_mm,
            quantity: item.quantity,
            box_id: item.box_id,
          })),
          has_printing: hasPrinting,
          printing_colors: printingColors,
          has_existing_polymer: hasExistingPolymer,
          has_die_cut: hasDieCut,
          client_distance_km: client?.distance_km,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al calcular');
        return;
      }

      setCalculation(data);
    } catch (error) {
      console.error('Error calculating:', error);
      alert('Error al calcular la cotizacion');
    } finally {
      setCalculating(false);
    }
  }

  async function saveQuote() {
    if (!calculation) {
      alert('Primero calcule la cotizacion');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || undefined,
          items: items.map(item => ({
            length_mm: item.length_mm,
            width_mm: item.width_mm,
            height_mm: item.height_mm,
            quantity: item.quantity,
            box_id: item.box_id,
          })),
          has_printing: hasPrinting,
          printing_colors: printingColors,
          has_existing_polymer: hasExistingPolymer,
          has_die_cut: hasDieCut,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      // Si hay archivo de diseño, subirlo
      if (designFile && hasPrinting) {
        setUploadingDesign(true);
        try {
          // Subir archivo
          const formData = new FormData();
          formData.append('file', designFile);
          formData.append('folder', 'designs');

          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          const uploadData = await uploadRes.json();

          if (uploadRes.ok && uploadData.url) {
            // Guardar referencia del diseño
            await fetch(`/api/quotes/${data.id}/design`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: designFile.name,
                file_url: uploadData.url,
                file_type: designFile.type,
                colors: printingColors,
              }),
            });
          }
        } catch (uploadError) {
          console.error('Error uploading design:', uploadError);
          // No bloquear la navegación por error en el upload
        } finally {
          setUploadingDesign(false);
        }
      }

      router.push(`/cotizaciones/${data.id}`);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Error al guardar la cotizacion');
    } finally {
      setSaving(false);
    }
  }

  const boxOptions = boxes.map(box => ({
    value: box.id,
    label: `${box.name} - ${formatBoxDimensions(box.length_mm, box.width_mm, box.height_mm)}`,
  }));

  const clientOptions = clients.map(client => ({
    value: client.id,
    label: client.company ? `${client.name} (${client.company})` : client.name,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nueva Cotizacion</h1>
        <p className="text-gray-500">Crea una nueva cotizacion para un cliente</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client */}
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientSearch
                clients={clients}
                selectedClientId={clientId}
                onSelect={setClientId}
                onCreateNew={() => setShowCreateClientModal(true)}
                label="Seleccionar cliente (opcional)"
              />
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items de la cotizacion</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id} className="p-4 border border-gray-200 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Item {index + 1}</span>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Select
                        label="Caja del catalogo (opcional)"
                        options={boxOptions}
                        value={item.box_id || ''}
                        onChange={(e) => updateItem(item.id, 'box_id', e.target.value)}
                        placeholder="Medidas personalizadas"
                      />
                    </div>
                    <Input
                      label="Largo (mm)"
                      type="number"
                      value={item.length_mm}
                      onChange={(e) => updateItem(item.id, 'length_mm', parseInt(e.target.value) || 0)}
                      min={200}
                    />
                    <Input
                      label="Ancho (mm)"
                      type="number"
                      value={item.width_mm}
                      onChange={(e) => updateItem(item.id, 'width_mm', parseInt(e.target.value) || 0)}
                      min={200}
                    />
                    <Input
                      label="Alto (mm)"
                      type="number"
                      value={item.height_mm}
                      onChange={(e) => updateItem(item.id, 'height_mm', parseInt(e.target.value) || 0)}
                      min={100}
                    />
                    <Input
                      label="Cantidad"
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      min={1}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle>Opciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPrinting}
                    onChange={(e) => setHasPrinting(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Con impresion</span>
                </label>
              </div>

              {hasPrinting && (
                <div className="pl-6 space-y-4">
                  <Input
                    label="Cantidad de colores (max 3)"
                    type="number"
                    value={printingColors}
                    onChange={(e) => setPrintingColors(Math.min(3, parseInt(e.target.value) || 0))}
                    min={1}
                    max={3}
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasExistingPolymer}
                      onChange={(e) => setHasExistingPolymer(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">El cliente ya tiene el polimero</span>
                  </label>

                  {/* Archivo de diseño */}
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Archivo de diseno (opcional)
                    </label>
                    {!designFile ? (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-2 text-gray-400" />
                          <p className="text-sm text-gray-500">
                            <span className="font-semibold">Click para subir</span>
                          </p>
                          <p className="text-xs text-gray-400">
                            JPG, PNG, PDF, SVG, AI, EPS (max 20MB)
                          </p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.svg,.ai,.eps,.psd"
                          onChange={handleDesignFileChange}
                        />
                      </label>
                    ) : (
                      <div className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          {designPreview ? (
                            <img
                              src={designPreview}
                              alt="Preview"
                              className="w-16 h-16 object-cover rounded"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                              <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {designFile.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(designFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={removeDesignFile}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasDieCut}
                    onChange={(e) => setHasDieCut(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">Con troquelado (costo a cotizar)</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionales para el cliente..."
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={calculateQuote} disabled={calculating}>
                {calculating ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Calculator className="w-4 h-4 mr-2" />
                )}
                Calcular Cotizacion
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Calculation Result */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              {!calculation ? (
                <p className="text-gray-500 text-sm">
                  Complete los datos y haga clic en &quot;Calcular Cotizacion&quot;
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Items calculados */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">Items:</h4>
                    {calculation.items.map((item: CalculatedItem, index: number) => (
                      <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                        <p className="font-medium">
                          {formatBoxDimensions(item.length_mm, item.width_mm, item.height_mm)}
                        </p>
                        <p className="text-gray-600">
                          {item.quantity.toLocaleString('es-AR')} uds = {formatM2(item.total_m2)} m2
                        </p>
                        {item.is_oversized && (
                          <Badge variant="warning" className="mt-1">Sobredimensionada</Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Totales */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total m2:</span>
                      <span className="font-medium">{formatM2(calculation.summary.total_m2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Precio/m2:</span>
                      <span className="font-medium">{formatCurrency(calculation.summary.price_per_m2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(calculation.summary.subtotal)}</span>
                    </div>
                    {calculation.summary.printing_cost > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Impresion:</span>
                        <span className="font-medium">{formatCurrency(calculation.summary.printing_cost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t pt-2 font-bold">
                      <span>Total:</span>
                      <span>{formatCurrency(calculation.summary.total)}</span>
                    </div>
                  </div>

                  {/* Info adicional */}
                  <div className="border-t pt-4 space-y-2 text-sm">
                    <p className="text-gray-600">
                      <strong>Producción:</strong> {calculation.summary.production_days} días hábiles
                    </p>
                    <p className="text-gray-600">
                      <strong>Envío:</strong> {calculation.summary.shipping_notes}
                    </p>
                  </div>

                  {/* Warnings */}
                  {calculation.summary.warnings.length > 0 && (
                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        {calculation.summary.warnings.map((warning: string, index: number) => (
                          <div key={index} className="flex gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            {calculation && (
              <CardFooter>
                <Button
                  className="w-full"
                  onClick={saveQuote}
                  disabled={saving || uploadingDesign}
                >
                  {saving || uploadingDesign ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">
                        {uploadingDesign ? 'Subiendo diseno...' : 'Guardando...'}
                      </span>
                    </>
                  ) : (
                    'Guardar Cotizacion'
                  )}
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>

      {/* Modal para crear nuevo cliente */}
      <CreateClientModal
        isOpen={showCreateClientModal}
        onClose={() => setShowCreateClientModal(false)}
        onCreated={(newClient) => {
          setClients([...clients, newClient]);
          setClientId(newClient.id);
        }}
      />
    </div>
  );
}
