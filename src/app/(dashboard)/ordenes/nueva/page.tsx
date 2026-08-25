'use client';

/**
 * Cargar un pedido a mano, sin cotizacion previa.
 *
 * Es la puerta para los pedidos que entran por telefono o mostrador. El
 * formulario espeja /cotizaciones/nueva (mismos componentes de cliente e
 * items) con las dos decisiones propias de una orden directa:
 *
 * EL PRECIO SE ELIGE, NO SE ADIVINA. "Precio de lista" lo calcula el motor,
 * el mismo de todas las cotizaciones. "Precio negociado" lo escribe el
 * vendedor, para los acuerdos que el motor no conoce. Si el motor rechaza
 * (bajo minimo), el panel lo dice y ofrece pasar a negociado sin perder lo
 * cargado — la decision es de la persona, nunca automatica.
 *
 * EL ESTADO INICIAL ES DOS, NO SIETE. "Esperando seña" o, si la seña ya se
 * cobro, "Confirmado" con el pago registrado en el mismo paso. A los demas
 * estados se llega por las transiciones normales: nacer "en produccion"
 * saltearia la maquina de estados y sus timestamps.
 */

import { useEffect, useState } from 'react';
import { SENA_PCT } from '@/lib/pagos/esquemas';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { ClientSearch, CreateClientModal } from '@/components/ui/client-search';
import { ArrowLeft, Plus, Trash2, Calculator } from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import type { Client, PaymentMethod, CalculateQuoteResponse } from '@/lib/types/database';

interface ItemForm {
  id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
}

const METODOS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'echeq', label: 'E-cheq' },
];

export default function NuevaOrdenPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const [clientId, setClientId] = useState('');
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [items, setItems] = useState<ItemForm[]>([
    { id: '1', length_mm: 400, width_mm: 300, height_mm: 200, quantity: 1000 },
  ]);
  const [hasPrinting, setHasPrinting] = useState(false);
  const [printingColors, setPrintingColors] = useState(0);

  const [pricingMode, setPricingMode] = useState<'motor' | 'manual'>('motor');
  const [manualSubtotal, setManualSubtotal] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [calculo, setCalculo] = useState<CalculateQuoteResponse | null>(null);
  // El motivo del motor cuando dijo que no: se muestra con el CTA de pasar a
  // precio negociado, que es la salida real de ese callejon.
  const [motorRechazo, setMotorRechazo] = useState<string | null>(null);

  const [initialStatus, setInitialStatus] = useState<'pending_deposit' | 'confirmed'>('pending_deposit');
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>('transferencia');
  const [depositAmount, setDepositAmount] = useState('');

  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch('/api/clients?limit=500')
      .then((r) => r.json())
      .then((d) => setClients(d.data || []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

  // Al elegir cliente, la direccion de entrega se precarga pero sigue editable.
  function seleccionarCliente(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) {
      if (c.address && !deliveryAddress) setDeliveryAddress(c.address);
      if (c.city && !deliveryCity) setDeliveryCity(c.city);
    }
  }

  function updateItem(id: string, field: keyof ItemForm, value: number) {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    setCalculo(null);
  }

  async function calcular() {
    setCalculating(true);
    setMotorRechazo(null);
    try {
      const res = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(({ length_mm, width_mm, height_mm, quantity }) => ({
            length_mm, width_mm, height_mm, quantity,
          })),
          has_printing: hasPrinting,
          printing_colors: printingColors,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMotorRechazo(data.error || 'El motor no pudo calcular');
        setCalculo(null);
        return;
      }
      setCalculo(data);
    } finally {
      setCalculating(false);
    }
  }

  async function crearOrden() {
    if (initialStatus === 'confirmed' && !depositMethod) {
      alert('Si la orden nace confirmada hay que registrar cómo se cobró la seña.');
      return;
    }
    if (pricingMode === 'manual') {
      const st = parseFloat(manualSubtotal);
      const tt = parseFloat(manualTotal);
      if (!(st > 0) || !(tt > 0)) {
        alert('Con precio negociado hay que cargar subtotal y total mayores a cero.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || undefined,
          items: items.map(({ length_mm, width_mm, height_mm, quantity }) => ({
            length_mm, width_mm, height_mm, quantity,
          })),
          has_printing: hasPrinting,
          printing_colors: printingColors,
          pricing_mode: pricingMode,
          ...(pricingMode === 'manual'
            ? {
                manual_pricing: {
                  subtotal: parseFloat(manualSubtotal),
                  total: parseFloat(manualTotal),
                },
              }
            : {}),
          estimated_delivery: estimatedDelivery || undefined,
          delivery_address: deliveryAddress || undefined,
          delivery_city: deliveryCity || undefined,
          notes: notes || undefined,
          initial_status: initialStatus,
          ...(initialStatus === 'confirmed'
            ? {
                deposit: {
                  method: depositMethod,
                  ...(parseFloat(depositAmount) > 0 ? { amount: parseFloat(depositAmount) } : {}),
                },
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // El "no" del motor trae la salida: pasar a precio negociado.
        if (data.hint) {
          setMotorRechazo(data.error);
        } else {
          alert(data.error || 'Error al crear la orden');
        }
        return;
      }
      router.push(`/ordenes/${data.order.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/ordenes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cargar pedido a mano</h1>
          <p className="text-gray-500">Para lo que entra por teléfono o mostrador, sin cotización previa</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent>
              <ClientSearch
                clients={clients}
                selectedClientId={clientId}
                onSelect={seleccionarCliente}
                onCreateNew={() => setShowCreateClientModal(true)}
                label="Seleccionar cliente (opcional)"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cajas</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems([...items, { id: String(Date.now()), length_mm: 400, width_mm: 300, height_mm: 200, quantity: 1000 }])
                }
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Item {index + 1}</span>
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setItems(items.filter((i) => i.id !== item.id))}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Input label="Largo (mm)" type="number" value={item.length_mm}
                      onChange={(e) => updateItem(item.id, 'length_mm', parseInt(e.target.value) || 0)} />
                    <Input label="Ancho (mm)" type="number" value={item.width_mm}
                      onChange={(e) => updateItem(item.id, 'width_mm', parseInt(e.target.value) || 0)} />
                    <Input label="Alto (mm)" type="number" value={item.height_mm}
                      onChange={(e) => updateItem(item.id, 'height_mm', parseInt(e.target.value) || 0)} />
                    <Input label="Cantidad" type="number" value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              ))}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasPrinting}
                  onChange={(e) => { setHasPrinting(e.target.checked); if (!e.target.checked) setPrintingColors(0); }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm">Con impresión</span>
              </label>
              {hasPrinting && (
                <Input label="Cantidad de colores (máx 3)" type="number" min={1} max={3} value={printingColors}
                  onChange={(e) => setPrintingColors(Math.min(3, parseInt(e.target.value) || 0))} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Precio</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="pricing" checked={pricingMode === 'motor'}
                    onChange={() => setPricingMode('motor')} className="w-4 h-4" />
                  <span className="text-sm font-medium">Precio de lista</span>
                  <span className="text-xs text-gray-500">lo calcula el cotizador</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="pricing" checked={pricingMode === 'manual'}
                    onChange={() => setPricingMode('manual')} className="w-4 h-4" />
                  <span className="text-sm font-medium">Precio negociado</span>
                  <span className="text-xs text-gray-500">lo escribís vos</span>
                </label>
              </div>

              {pricingMode === 'motor' && (
                <div className="space-y-3">
                  <Button variant="outline" onClick={calcular} disabled={calculating}>
                    {calculating ? <LoadingSpinner size="sm" /> : <Calculator className="w-4 h-4 mr-2" />}
                    Calcular precio
                  </Button>
                  {calculo && (
                    <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                      <p>{formatM2(calculo.summary.total_m2)} m² · {formatCurrency(calculo.summary.price_per_m2)}/m²</p>
                      <p className="font-semibold">Subtotal: {formatCurrency(calculo.summary.subtotal)} + IVA</p>
                      {calculo.summary.warnings.map((w, i) => (
                        <p key={i} className="text-amber-700 text-xs">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {pricingMode === 'manual' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Subtotal sin IVA ($)" type="number" value={manualSubtotal}
                    onChange={(e) => setManualSubtotal(e.target.value)} />
                  <Input label="Total ($)" type="number" value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)} />
                  <p className="sm:col-span-2 text-xs text-gray-500">
                    El precio negociado se guarda tal cual y la orden queda marcada
                    «Precio negociado». Las medidas igual pasan por el control de
                    fabricación: un precio a mano no agranda el rollo de 1.200 mm.
                  </p>
                </div>
              )}

              {motorRechazo && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-sm text-amber-900">{motorRechazo}</p>
                  {pricingMode === 'motor' && (
                    <Button variant="outline" size="sm" onClick={() => { setPricingMode('manual'); setMotorRechazo(null); }}>
                      Cargar con precio negociado
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Estado inicial</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado" checked={initialStatus === 'pending_deposit'}
                    onChange={() => setInitialStatus('pending_deposit')} className="w-4 h-4" />
                  <span className="text-sm font-medium">Esperando seña</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado" checked={initialStatus === 'confirmed'}
                    onChange={() => setInitialStatus('confirmed')} className="w-4 h-4" />
                  <span className="text-sm font-medium">Ya cobré la seña</span>
                </label>
              </div>
              {initialStatus === 'confirmed' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-1">
                  <Select label="Cómo se cobró" value={depositMethod}
                    options={METODOS.map((m) => ({ value: m.value, label: m.label }))}
                    onChange={(e) => setDepositMethod(e.target.value as PaymentMethod)} />
                  <Input label={`Monto de la seña (vacío = ${SENA_PCT}%)`} type="number" value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Fecha de entrega comprometida" type="date" value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)} />
              <div className="hidden sm:block" />
              <Input label="Dirección de entrega" value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)} />
              <Input label="Ciudad" value={deliveryCity}
                onChange={(e) => setDeliveryCity(e.target.value)} />
              <div className="sm:col-span-2">
                <Input label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <Button className="w-full" onClick={crearOrden} disabled={saving}>
                {saving ? <LoadingSpinner size="sm" /> : 'Crear orden'}
              </Button>
              <p className="text-xs text-gray-500">
                La orden queda marcada como <b>Manual</b> para diferenciarla de las
                que entran por la web. El número sale de la misma serie OC-.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateClientModal
        isOpen={showCreateClientModal}
        onClose={() => setShowCreateClientModal(false)}
        onCreated={(newClient) => {
          setClients([...clients, newClient]);
          seleccionarCliente(newClient.id);
        }}
      />
    </div>
  );
}
