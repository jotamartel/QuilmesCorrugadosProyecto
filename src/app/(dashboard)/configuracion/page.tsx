'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import {
  Settings,
  DollarSign,
  Truck,
  Clock,
  Save,
  Building2,
  Link,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Palette
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import type { PricingConfig, FullSystemConfig } from '@/lib/types/database';

type Tab = 'precios' | 'empresa' | 'xubio' | 'arba';

export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('precios');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [systemConfig, setSystemConfig] = useState<Partial<FullSystemConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [testingXubio, setTestingXubio] = useState(false);
  const [testingArba, setTestingArba] = useState(false);
  const [xubioStatus, setXubioStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [arbaStatus, setArbaStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Form state for pricing
  // Estos valores se pisan con la config real apenas carga. Se mantienen
  // alineados con pricing_config para que un fallo de lectura no muestre
  // precios viejos en el formulario.
  const [pricingFormData, setPricingFormData] = useState({
    price_per_m2_standard: 900,
    price_per_m2_volume: 800,
    volume_threshold_m2: 5000,
    min_m2_per_model: 3000,
    wholesale_min_m2: 1000, // Limite entre stock (/cajas) y produccion a medida
    price_per_m2_below_minimum: 1000, // Recargo entre wholesale_min_m2 y min_m2_per_model
    price_per_m2_retail: 1200, // Precio de stock, por debajo de wholesale_min_m2
    printing_min_m2: 1000,
    printing_included_min_m2: 1000,
    printing_surcharge_per_color: 0,
    free_shipping_min_m2: 3000,
    free_shipping_max_km: 60,
    production_days_standard: 7,
    production_days_printing: 14,
    quote_validity_days: 7,
  });

  // Form state for system config
  const [systemFormData, setSystemFormData] = useState<Partial<FullSystemConfig>>({});

  useEffect(() => {
    fetchAllConfig();
  }, []);

  async function fetchAllConfig() {
    try {
      const [pricingRes, systemRes] = await Promise.all([
        fetch('/api/config/pricing'),
        fetch('/api/config'),
      ]);

      if (pricingRes.ok) {
        const data = await pricingRes.json();
        setPricingConfig(data);
        setPricingFormData({
          price_per_m2_standard: data.price_per_m2_standard,
          price_per_m2_volume: data.price_per_m2_volume,
          volume_threshold_m2: data.volume_threshold_m2,
          min_m2_per_model: data.min_m2_per_model,
          wholesale_min_m2: data.wholesale_min_m2 ?? 1000,
          printing_min_m2: data.printing_min_m2 ?? 1000,
          printing_included_min_m2: data.printing_included_min_m2 ?? 3000,
          printing_surcharge_per_color: data.printing_surcharge_per_color ?? 0.15,
          price_per_m2_below_minimum: data.price_per_m2_below_minimum || (data.price_per_m2_standard * 1.20),
          price_per_m2_retail: data.price_per_m2_retail || 990,
          free_shipping_min_m2: data.free_shipping_min_m2,
          free_shipping_max_km: data.free_shipping_max_km,
          production_days_standard: data.production_days_standard,
          production_days_printing: data.production_days_printing,
          quote_validity_days: data.quote_validity_days,
        });
      }

      if (systemRes.ok) {
        const data = await systemRes.json();
        setSystemConfig(data);
        setSystemFormData(data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePricing() {
    setSaving(true);
    try {
      const res = await fetch('/api/config/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricingFormData),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      setPricingConfig(data);
      setEditMode(false);
      alert('Configuración de precios actualizada correctamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSystem() {
    // Un dato bancario mal cargado se difunde a la web, al bot y a los avisos
    // al mismo tiempo, asi que se valida aca antes de mandar. Vacio es valido:
    // significa "todavia no publicar" y todos los canales caen a su fallback.
    const cbu = (systemFormData.payment_bank_cbu || '').trim();
    if (cbu && !/^d{22}$/.test(cbu)) {
      alert('El CBU/CVU tiene que tener exactamente 22 dígitos, sin espacios ni guiones.');
      return;
    }
    const cuitBanco = (systemFormData.payment_bank_cuit || '').trim();
    if (cuitBanco && !/^d{2}-d{8}-d$/.test(cuitBanco)) {
      alert('El CUIT del titular va con el formato XX-XXXXXXXX-X.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(systemFormData),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      setSystemConfig(systemFormData);
      setEditMode(false);
      alert('Configuración actualizada correctamente');
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  async function testXubioConnection() {
    setTestingXubio(true);
    setXubioStatus(null);
    try {
      const res = await fetch('/api/xubio/test-connection', { method: 'POST' });
      const data = await res.json();
      setXubioStatus(data);
    } catch (error) {
      setXubioStatus({ success: false, message: 'Error de conexión' });
    } finally {
      setTestingXubio(false);
    }
  }

  async function testArbaConnection() {
    setTestingArba(true);
    setArbaStatus(null);
    try {
      const res = await fetch('/api/arba/test-connection', { method: 'POST' });
      const data = await res.json();
      setArbaStatus(data);
    } catch (error) {
      setArbaStatus({ success: false, message: 'Error de conexión' });
    } finally {
      setTestingArba(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  const tabs = [
    { id: 'precios' as Tab, label: 'Precios', icon: DollarSign },
    { id: 'empresa' as Tab, label: 'Empresa', icon: Building2 },
    { id: 'xubio' as Tab, label: 'Xubio', icon: Link },
    { id: 'arba' as Tab, label: 'ARBA COT', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500">Configura los parámetros del sistema</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setEditMode(false); }}
              className={`flex items-center gap-2 px-3 py-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="max-w-3xl">
        {/* Precios Tab */}
        {activeTab === 'precios' && (
          <div className="space-y-6">
            {pricingConfig && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Settings className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Configuración vigente</p>
                      <p className="text-sm text-gray-500">
                        Desde: {formatDate(pricingConfig.valid_from)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Precios
                </CardTitle>
                <CardDescription>
                  Configurá los precios por metro cuadrado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Precio por volumen ($/m2)"
                    type="number"
                    value={pricingFormData.price_per_m2_volume}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, price_per_m2_volume: Number(e.target.value) })}
                    disabled={!editMode}
                    hint={`Actual: ${formatCurrency(pricingConfig?.price_per_m2_volume || 0)} — Pedidos > ${pricingFormData.volume_threshold_m2} m2`}
                  />
                  <Input
                    label="Precio estándar ($/m2)"
                    type="number"
                    value={pricingFormData.price_per_m2_standard}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, price_per_m2_standard: Number(e.target.value) })}
                    disabled={!editMode}
                    hint={`Actual: ${formatCurrency(pricingConfig?.price_per_m2_standard || 0)} — Pedidos de ${pricingFormData.min_m2_per_model} a ${pricingFormData.volume_threshold_m2} m2`}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Precio menor al mínimo ($/m2)"
                    type="number"
                    value={pricingFormData.price_per_m2_below_minimum}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, price_per_m2_below_minimum: Number(e.target.value) })}
                    disabled={!editMode}
                    hint={`Actual: ${formatCurrency(pricingConfig?.price_per_m2_below_minimum || 0)} — Pedidos de ${pricingFormData.wholesale_min_m2} a ${pricingFormData.min_m2_per_model} m2`}
                  />
                  <Input
                    label="Precio de stock ($/m2)"
                    type="number"
                    value={pricingFormData.price_per_m2_retail}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, price_per_m2_retail: Number(e.target.value) })}
                    disabled={!editMode}
                    hint={`Actual: ${formatCurrency(pricingConfig?.price_per_m2_retail || 990)} — Pedidos < ${pricingFormData.wholesale_min_m2} m2 (canal minorista, /cajas)`}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Límite stock / a medida (m2)"
                    type="number"
                    value={pricingFormData.wholesale_min_m2}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, wholesale_min_m2: Number(e.target.value) })}
                    disabled={!editMode}
                    hint="Hasta acá se vende de stock por /cajas. De acá en adelante se produce a medida y cotiza el mayorista"
                  />
                  <Input
                    label="Mínimo m2 por modelo"
                    type="number"
                    value={pricingFormData.min_m2_per_model}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, min_m2_per_model: Number(e.target.value) })}
                    disabled={!editMode}
                    hint="Debajo de este volumen, la producción a medida lleva recargo"
                  />
                  <Input
                    label="Umbral de volumen (m2)"
                    type="number"
                    value={pricingFormData.volume_threshold_m2}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, volume_threshold_m2: Number(e.target.value) })}
                    disabled={!editMode}
                    hint="m2 a partir de los cuales aplica precio por volumen"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Envío
                </CardTitle>
                <CardDescription>
                  Configurá las condiciones de envío gratis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Mínimo m2 para envío gratis"
                    type="number"
                    value={pricingFormData.free_shipping_min_m2}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, free_shipping_min_m2: Number(e.target.value) })}
                    disabled={!editMode}
                  />
                  <Input
                    label="Distancia máxima (km)"
                    type="number"
                    value={pricingFormData.free_shipping_max_km}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, free_shipping_max_km: Number(e.target.value) })}
                    disabled={!editMode}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Impresión
                </CardTitle>
                <CardDescription>
                  Desde los {pricingFormData.printing_included_min_m2.toLocaleString('es-AR')} m² el costo de
                  impresión ya está incluido en el precio por m² y no se cobra recargo. El polímero se cotiza
                  siempre aparte y va a cargo del comprador.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Se ofrece desde (m2)"
                    type="number"
                    value={pricingFormData.printing_min_m2}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, printing_min_m2: Number(e.target.value) })}
                    disabled={!editMode}
                    hint="Por debajo de este volumen no se ofrece impresión."
                  />
                  <Input
                    label="Incluida desde (m2)"
                    type="number"
                    value={pricingFormData.printing_included_min_m2}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, printing_included_min_m2: Number(e.target.value) })}
                    disabled={!editMode}
                    hint="Desde acá no se cobra recargo por color."
                  />
                  <Input
                    label="Recargo por color (%)"
                    type="number"
                    value={Math.round(pricingFormData.printing_surcharge_per_color * 100)}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, printing_surcharge_per_color: Number(e.target.value) / 100 })}
                    disabled={!editMode}
                    hint="Solo entre los dos valores de arriba."
                  />
                </div>
                {/* Igualar los dos umbrales es como se deja de ofrecer impresion
                    en la franja intermedia, sin tocar codigo. */}
                {pricingFormData.printing_min_m2 >= pricingFormData.printing_included_min_m2 && (
                  <p className="text-sm text-gray-600">
                    Con estos valores la impresión se ofrece solo cuando ya viene incluida: no hay franja con recargo.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Producción y validez
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Días producción sin impresión"
                    type="number"
                    value={pricingFormData.production_days_standard}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, production_days_standard: Number(e.target.value) })}
                    disabled={!editMode}
                  />
                  <Input
                    label="Días producción con impresión"
                    type="number"
                    value={pricingFormData.production_days_printing}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, production_days_printing: Number(e.target.value) })}
                    disabled={!editMode}
                  />
                  <Input
                    label="Validez cotización (días)"
                    type="number"
                    value={pricingFormData.quote_validity_days}
                    onChange={(e) => setPricingFormData({ ...pricingFormData, quote_validity_days: Number(e.target.value) })}
                    disabled={!editMode}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-3">
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => setEditMode(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSavePricing} disabled={saving}>
                      {saving ? <LoadingSpinner size="sm" /> : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Guardar cambios
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setEditMode(true)}>
                    Editar configuración
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Empresa Tab */}
        {activeTab === 'empresa' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Datos de la Empresa
              </CardTitle>
              <CardDescription>
                Información de Quilmes Corrugados para facturación y COT
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Razón Social"
                value={systemFormData.company_name || ''}
                onChange={(e) => setSystemFormData({ ...systemFormData, company_name: e.target.value })}
                disabled={!editMode}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="CUIT"
                  value={systemFormData.company_cuit || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_cuit: e.target.value })}
                  disabled={!editMode}
                  placeholder="XX-XXXXXXXX-X"
                />
                <Input
                  label="Ingresos Brutos"
                  value={systemFormData.company_iibb || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_iibb: e.target.value })}
                  disabled={!editMode}
                />
              </div>
              <Input
                label="Domicilio Fiscal"
                value={systemFormData.company_address || ''}
                onChange={(e) => setSystemFormData({ ...systemFormData, company_address: e.target.value })}
                disabled={!editMode}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Ciudad"
                  value={systemFormData.company_city || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_city: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="Provincia"
                  value={systemFormData.company_province || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_province: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="Código Postal"
                  value={systemFormData.company_postal_code || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_postal_code: e.target.value })}
                  disabled={!editMode}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={systemFormData.company_email || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_email: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="Teléfono"
                  value={systemFormData.company_phone || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, company_phone: e.target.value })}
                  disabled={!editMode}
                />
              </div>
              <Input
                label="Inicio de Actividades"
                type="date"
                value={systemFormData.company_start_date || ''}
                onChange={(e) => setSystemFormData({ ...systemFormData, company_start_date: e.target.value })}
                disabled={!editMode}
              />

              {/* Datos bancarios para transferencias */}
              <div className="pt-6 border-t">
                <h3 className="font-semibold text-gray-900">Datos bancarios para transferencias</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Se muestran en la página pública de la cotización, en el bot de WhatsApp y en
                  los avisos automáticos al cliente. Los cuatro primeros van juntos: si falta
                  alguno, ningún canal publica ninguno.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Alias"
                  placeholder="quilmes.corrugados"
                  value={systemFormData.payment_bank_alias || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, payment_bank_alias: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="CBU / CVU"
                  placeholder="22 dígitos"
                  value={systemFormData.payment_bank_cbu || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, payment_bank_cbu: e.target.value })}
                  disabled={!editMode}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Titular de la cuenta"
                  value={systemFormData.payment_bank_holder || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, payment_bank_holder: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="CUIT del titular"
                  placeholder="XX-XXXXXXXX-X"
                  value={systemFormData.payment_bank_cuit || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, payment_bank_cuit: e.target.value })}
                  disabled={!editMode}
                />
                <Input
                  label="Banco (opcional)"
                  value={systemFormData.payment_bank_name || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, payment_bank_name: e.target.value })}
                  disabled={!editMode}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3">
              {editMode ? (
                <>
                  <Button variant="outline" onClick={() => { setEditMode(false); setSystemFormData(systemConfig); }}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveSystem} disabled={saving}>
                    {saving ? <LoadingSpinner size="sm" /> : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar cambios
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setEditMode(true)}>
                  Editar datos
                </Button>
              )}
            </CardFooter>
          </Card>
        )}

        {/* Xubio Tab */}
        {activeTab === 'xubio' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Link className="w-5 h-5" />
                      Integración Xubio
                    </CardTitle>
                    <CardDescription>
                      Configura la conexión con Xubio para facturación electrónica
                    </CardDescription>
                  </div>
                  <Badge variant={systemConfig.xubio_enabled ? 'success' : 'default'}>
                    {systemConfig.xubio_enabled ? 'Habilitado' : 'Deshabilitado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="xubio_enabled"
                    checked={systemFormData.xubio_enabled || false}
                    onChange={(e) => setSystemFormData({ ...systemFormData, xubio_enabled: e.target.checked })}
                    disabled={!editMode}
                    className="w-4 h-4"
                  />
                  <label htmlFor="xubio_enabled" className="text-sm font-medium">
                    Habilitar integración con Xubio
                  </label>
                </div>

                <Input
                  label="Client ID"
                  value={systemFormData.xubio_client_id || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, xubio_client_id: e.target.value })}
                  disabled={!editMode}
                  placeholder="Ingrese el Client ID de Xubio"
                />
                <Input
                  label="Secret ID"
                  type="password"
                  value={systemFormData.xubio_secret_id || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, xubio_secret_id: e.target.value })}
                  disabled={!editMode}
                  placeholder="Ingrese el Secret ID de Xubio"
                />
                <Input
                  label="Punto de Venta"
                  type="number"
                  value={systemFormData.xubio_point_of_sale || '1'}
                  onChange={(e) => setSystemFormData({ ...systemFormData, xubio_point_of_sale: e.target.value })}
                  disabled={!editMode}
                  hint="Número de punto de venta para facturas"
                />

                {xubioStatus && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    xubioStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {xubioStatus.success ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span className="text-sm">{xubioStatus.message}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={testXubioConnection}
                  disabled={testingXubio || !systemConfig.xubio_client_id}
                >
                  {testingXubio ? <LoadingSpinner size="sm" /> : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Probar conexión
                    </>
                  )}
                </Button>
                <div className="flex gap-3">
                  {editMode ? (
                    <>
                      <Button variant="outline" onClick={() => { setEditMode(false); setSystemFormData(systemConfig); }}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveSystem} disabled={saving}>
                        {saving ? <LoadingSpinner size="sm" /> : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Guardar
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setEditMode(true)}>
                      Editar configuración
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Funcionalidades disponibles</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Sincronización automática de clientes</li>
                  <li>• Emisión de Facturas A y B con CAE</li>
                  <li>• Generación de Recibos de cobro</li>
                  <li>• Emisión de Remitos</li>
                  <li>• Envío automático por email</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ARBA Tab */}
        {activeTab === 'arba' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      ARBA COT
                    </CardTitle>
                    <CardDescription>
                      Configura el Código de Operación de Traslado para transporte en PBA
                    </CardDescription>
                  </div>
                  <Badge variant={systemConfig.arba_cot_enabled ? 'success' : 'default'}>
                    {systemConfig.arba_cot_enabled ? 'Habilitado' : 'Deshabilitado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="arba_enabled"
                    checked={systemFormData.arba_cot_enabled || false}
                    onChange={(e) => setSystemFormData({ ...systemFormData, arba_cot_enabled: e.target.checked })}
                    disabled={!editMode}
                    className="w-4 h-4"
                  />
                  <label htmlFor="arba_enabled" className="text-sm font-medium">
                    Habilitar integración COT ARBA
                  </label>
                </div>

                <Input
                  label="Usuario CIT"
                  value={systemFormData.arba_cit_user || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, arba_cit_user: e.target.value })}
                  disabled={!editMode}
                  placeholder="Usuario del Centro de Información Tributaria"
                />
                <Input
                  label="Contraseña CIT"
                  type="password"
                  value={systemFormData.arba_cit_password || ''}
                  onChange={(e) => setSystemFormData({ ...systemFormData, arba_cit_password: e.target.value })}
                  disabled={!editMode}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Código de Producto NCM"
                    value={systemFormData.arba_cot_product_code || '16.05.11.10'}
                    onChange={(e) => setSystemFormData({ ...systemFormData, arba_cot_product_code: e.target.value })}
                    disabled={!editMode}
                    hint="Código NCM para cajas de cartón"
                  />
                  <Input
                    label="Unidad de Medida"
                    value={systemFormData.arba_cot_product_unit || 'UNI'}
                    onChange={(e) => setSystemFormData({ ...systemFormData, arba_cot_product_unit: e.target.value })}
                    disabled={!editMode}
                    hint="UNI = Unidades"
                  />
                </div>

                {arbaStatus && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    arbaStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {arbaStatus.success ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span className="text-sm">{arbaStatus.message}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={testArbaConnection}
                  disabled={testingArba || !systemConfig.arba_cit_user}
                >
                  {testingArba ? <LoadingSpinner size="sm" /> : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Verificar configuración
                    </>
                  )}
                </Button>
                <div className="flex gap-3">
                  {editMode ? (
                    <>
                      <Button variant="outline" onClick={() => { setEditMode(false); setSystemFormData(systemConfig); }}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveSystem} disabled={saving}>
                        {saving ? <LoadingSpinner size="sm" /> : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Guardar
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setEditMode(true)}>
                      Editar configuración
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Sobre el COT</h4>
                <p className="text-sm text-gray-600 mb-3">
                  El Código de Operación de Traslado es obligatorio para el transporte de
                  mercaderías en la Provincia de Buenos Aires.
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Se genera automáticamente al despachar una orden</li>
                  <li>• El número de COT se incluye en el remito impreso</li>
                  <li>• Debe coincidir la patente del vehículo asignado</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
