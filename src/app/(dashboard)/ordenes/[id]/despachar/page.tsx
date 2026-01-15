'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Truck,
  FileText,
  Receipt,
  Send,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Printer
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import type { Vehicle } from '@/lib/types/database';

interface DispatchPreview {
  order: {
    id: string;
    order_number: string;
    status: string;
    quantities_confirmed: boolean;
    payment_scheme: string;
    total: number;
    vehicle: Vehicle | null;
  };
  client: {
    id: string;
    name: string;
    company: string | null;
    cuit: string | null;
    address: string | null;
    city: string | null;
  };
  integrations: {
    xubio_enabled: boolean;
    arba_enabled: boolean;
    xubio_deposit_invoice: string | null;
    xubio_balance_invoice: string | null;
    xubio_remito: string | null;
    cot_number: string | null;
  };
  previews: {
    invoice: {
      tipo_comprobante: string;
      cliente: string;
      cuit: string;
      items: { concepto: string; cantidad: number; precio: number; subtotal: number }[];
      subtotal: number;
      iva: number;
      total: number;
    } | null;
    remito: {
      cliente: string;
      domicilio_entrega: string;
      fecha: string;
      items: { concepto: string; cantidad: number }[];
      cot_number?: string;
    } | null;
    cot: {
      remitente: { cuit: string; razon_social: string; domicilio: string };
      destinatario: { cuit: string; razon_social: string; domicilio: string };
      transporte: { patente: string; conductor: string; cuit_conductor: string };
      productos: { descripcion: string; cantidad: number; valor: number }[];
      warnings: string[];
    } | null;
  };
}

export default function DespacharPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<DispatchPreview | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);

  // Options
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [generateRemito, setGenerateRemito] = useState(true);
  const [generateCot, setGenerateCot] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  // Results
  const [results, setResults] = useState<{
    invoice?: { id: number; numero: string };
    remito?: { id: number; numero: string };
    cot?: { cot_number: string };
    errors: string[];
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      const [previewRes, vehiclesRes] = await Promise.all([
        fetch(`/api/orders/${id}/dispatch`),
        fetch('/api/vehicles?active=true'),
      ]);

      if (!previewRes.ok) {
        const error = await previewRes.json();
        alert(error.error || 'Error al cargar datos');
        router.push(`/ordenes/${id}`);
        return;
      }

      const previewData = await previewRes.json();
      setPreview(previewData);

      if (previewData.order.vehicle) {
        setSelectedVehicle(previewData.order.vehicle.id);
      }

      if (vehiclesRes.ok) {
        const vehiclesData = await vehiclesRes.json();
        setVehicles(vehiclesData);
      }
    } catch (error) {
      console.error('Error:', error);
      router.push(`/ordenes/${id}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispatch() {
    if (!selectedVehicle && (generateCot || generateRemito)) {
      alert('Seleccione un vehiculo para generar el COT o remito');
      return;
    }

    setDispatching(true);
    setResults(null);

    try {
      const res = await fetch(`/api/orders/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: selectedVehicle || null,
          generate_invoice: generateInvoice,
          generate_remito: generateRemito,
          generate_cot: generateCot,
          send_invoice_email: sendEmail,
        }),
      });

      const data = await res.json();
      setResults(data.results);

      if (data.success) {
        setTimeout(() => {
          router.push(`/ordenes/${id}`);
        }, 2000);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al despachar orden');
    } finally {
      setDispatching(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!preview) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No se pudo cargar la información</p>
      </div>
    );
  }

  const { order, client, integrations, previews } = preview;

  // Validaciones
  const canDispatch = order.status === 'ready' && order.quantities_confirmed;
  const hasWarnings = previews.cot?.warnings && previews.cot.warnings.length > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/ordenes/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Despachar Orden</h1>
          <p className="text-gray-500">{order.order_number} - {client.company || client.name}</p>
        </div>
      </div>

      {/* Results */}
      {results && (
        <Card className={results.errors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {results.errors.length === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {results.errors.length === 0 ? 'Orden despachada correctamente' : 'Orden despachada con algunos errores'}
                </p>
                {results.invoice && (
                  <p className="text-sm">Factura: {results.invoice.numero}</p>
                )}
                {results.remito && (
                  <p className="text-sm">Remito: {results.remito.numero}</p>
                )}
                {results.cot && (
                  <p className="text-sm">COT: {results.cot.cot_number}</p>
                )}
                {results.errors.map((err, i) => (
                  <p key={i} className="text-sm text-red-600">{err}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Advertencias para el COT</p>
                <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                  {previews.cot?.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Options */}
        <div className="space-y-6">
          {/* Vehicle */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Vehiculo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
              >
                <option value="">Seleccionar vehiculo...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.patent} - {v.description || v.driver_name || 'Sin descripcion'}
                  </option>
                ))}
              </Select>
              {selectedVehicle && vehicles.find(v => v.id === selectedVehicle) && (
                <div className="mt-3 text-sm text-gray-600">
                  <p>Conductor: {vehicles.find(v => v.id === selectedVehicle)?.driver_name || '-'}</p>
                  <p>CUIT: {vehicles.find(v => v.id === selectedVehicle)?.driver_cuit || '-'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Integrations */}
          <Card>
            <CardHeader>
              <CardTitle>Generar documentos</CardTitle>
              <CardDescription>Seleccione los documentos a generar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateInvoice}
                  onChange={(e) => setGenerateInvoice(e.target.checked)}
                  disabled={!integrations.xubio_enabled}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">Factura</span>
                    {integrations.xubio_balance_invoice && (
                      <Badge variant="success">Ya emitida: {integrations.xubio_balance_invoice}</Badge>
                    )}
                  </div>
                  {!integrations.xubio_enabled && (
                    <p className="text-xs text-gray-500 mt-1">Xubio no está habilitado</p>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateRemito}
                  onChange={(e) => setGenerateRemito(e.target.checked)}
                  disabled={!integrations.xubio_enabled}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">Remito</span>
                    {integrations.xubio_remito && (
                      <Badge variant="success">Ya emitido: {integrations.xubio_remito}</Badge>
                    )}
                  </div>
                  {!integrations.xubio_enabled && (
                    <p className="text-xs text-gray-500 mt-1">Xubio no está habilitado</p>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateCot}
                  onChange={(e) => setGenerateCot(e.target.checked)}
                  disabled={!integrations.arba_enabled}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">COT ARBA</span>
                    {integrations.cot_number && (
                      <Badge variant="success">Ya generado: {integrations.cot_number}</Badge>
                    )}
                  </div>
                  {!integrations.arba_enabled && (
                    <p className="text-xs text-gray-500 mt-1">ARBA COT no está habilitado</p>
                  )}
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  disabled={!generateInvoice || !client.company}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-gray-500" />
                    <span className="font-medium">Enviar factura por email</span>
                  </div>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Previews */}
        <div className="space-y-6">
          {/* Invoice Preview */}
          {previews.invoice && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Preview Factura
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Tipo:</span>
                  <span className="font-medium">{previews.invoice.tipo_comprobante}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Cliente:</span>
                  <span className="font-medium">{previews.invoice.cliente}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>CUIT:</span>
                  <span className="font-mono">{previews.invoice.cuit}</span>
                </div>
                <hr />
                <div className="text-sm space-y-1">
                  {previews.invoice.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-600">{item.concepto}</span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <hr />
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(previews.invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>IVA (21%):</span>
                  <span>{formatCurrency(previews.invoice.iva)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total:</span>
                  <span>{formatCurrency(previews.invoice.total)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Remito Preview */}
          {previews.remito && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Preview Remito
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="text-gray-500">Entregar a:</p>
                  <p className="font-medium">{previews.remito.cliente}</p>
                  <p>{previews.remito.domicilio_entrega}</p>
                </div>
                <hr />
                <div className="text-sm space-y-1">
                  {previews.remito.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{item.concepto}</span>
                      <span className="font-medium">{item.cantidad} unid.</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardFooter className="flex justify-between p-4">
          <Link href={`/ordenes/${id}`}>
            <Button variant="outline">Cancelar</Button>
          </Link>
          <div className="flex gap-3">
            {integrations.xubio_remito && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/xubio/create-remito?order_id=${id}&print=true`, '_blank')}
              >
                <Printer className="w-4 h-4 mr-2" />
                Imprimir remito
              </Button>
            )}
            <Button
              onClick={handleDispatch}
              disabled={!canDispatch || dispatching}
            >
              {dispatching ? <LoadingSpinner size="sm" /> : (
                <>
                  <Truck className="w-4 h-4 mr-2" />
                  Despachar orden
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
