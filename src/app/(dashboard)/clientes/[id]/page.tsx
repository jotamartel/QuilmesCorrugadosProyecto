'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import {
  ArrowLeft,
  Building,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  ShoppingCart,
  TrendingUp,
  Package,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import {
  formatDistance,
  PAYMENT_TERMS_LABELS,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
} from '@/lib/utils/format';
import type { PaymentTerms, QuoteStatus, OrderStatus, TaxCondition } from '@/lib/types/database';
import { TAX_CONDITION_LABELS } from '@/lib/types/database';

interface ClientQuote {
  id: string;
  quote_number: string;
  status: QuoteStatus;
  total: number;
  created_at: string;
}

interface ClientOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
}

interface ClientWithRelations {
  id: string;
  name: string;
  company: string | null;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string;
  postal_code: string | null;
  distance_km: number | null;
  payment_terms: PaymentTerms;
  is_recurring: boolean;
  notes: string | null;
  // Campos de integración
  xubio_id: string | null;
  tax_condition: TaxCondition;
  has_credit: boolean;
  credit_days: number;
  credit_limit: number | null;
  credit_notes: string | null;
  quotes: ClientQuote[];
  orders: ClientOrder[];
  statistics: {
    total_orders: number;
    total_revenue: number;
    total_m2: number;
  };
}

interface EditFormData {
  name: string;
  company: string;
  cuit: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  distance_km: string;
  payment_terms: PaymentTerms;
  is_recurring: boolean;
  notes: string;
  tax_condition: TaxCondition;
  has_credit: boolean;
  credit_days: string;
  credit_limit: string;
  credit_notes: string;
}

const taxConditionOptions = [
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'consumidor_final', label: 'Consumidor Final' },
  { value: 'exento', label: 'Exento' },
];

const paymentTermsOptions = [
  { value: 'contado', label: 'Contado' },
  { value: 'cheque_30', label: 'Cheque a 30 días' },
];

const provinceOptions = [
  { value: 'Buenos Aires', label: 'Buenos Aires' },
  { value: 'CABA', label: 'CABA' },
  { value: 'Catamarca', label: 'Catamarca' },
  { value: 'Chaco', label: 'Chaco' },
  { value: 'Chubut', label: 'Chubut' },
  { value: 'Córdoba', label: 'Córdoba' },
  { value: 'Corrientes', label: 'Corrientes' },
  { value: 'Entre Ríos', label: 'Entre Ríos' },
  { value: 'Formosa', label: 'Formosa' },
  { value: 'Jujuy', label: 'Jujuy' },
  { value: 'La Pampa', label: 'La Pampa' },
  { value: 'La Rioja', label: 'La Rioja' },
  { value: 'Mendoza', label: 'Mendoza' },
  { value: 'Misiones', label: 'Misiones' },
  { value: 'Neuquén', label: 'Neuquén' },
  { value: 'Río Negro', label: 'Río Negro' },
  { value: 'Salta', label: 'Salta' },
  { value: 'San Juan', label: 'San Juan' },
  { value: 'San Luis', label: 'San Luis' },
  { value: 'Santa Cruz', label: 'Santa Cruz' },
  { value: 'Santa Fe', label: 'Santa Fe' },
  { value: 'Santiago del Estero', label: 'Santiago del Estero' },
  { value: 'Tierra del Fuego', label: 'Tierra del Fuego' },
  { value: 'Tucumán', label: 'Tucumán' },
];

export default function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<ClientWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<EditFormData | null>(null);

  useEffect(() => {
    fetchClient();
  }, [id]);

  async function fetchClient() {
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) {
        router.push('/clientes');
        return;
      }
      const data = await res.json();
      setClient(data);
      initFormData(data);
    } catch (error) {
      console.error('Error fetching client:', error);
      router.push('/clientes');
    } finally {
      setLoading(false);
    }
  }

  function initFormData(clientData: ClientWithRelations) {
    setFormData({
      name: clientData.name || '',
      company: clientData.company || '',
      cuit: clientData.cuit || '',
      email: clientData.email || '',
      phone: clientData.phone || '',
      whatsapp: clientData.whatsapp || '',
      address: clientData.address || '',
      city: clientData.city || '',
      province: clientData.province || 'Buenos Aires',
      postal_code: clientData.postal_code || '',
      distance_km: clientData.distance_km?.toString() || '',
      payment_terms: clientData.payment_terms || 'contado',
      is_recurring: clientData.is_recurring || false,
      notes: clientData.notes || '',
      tax_condition: clientData.tax_condition || 'responsable_inscripto',
      has_credit: clientData.has_credit || false,
      credit_days: clientData.credit_days?.toString() || '30',
      credit_limit: clientData.credit_limit?.toString() || '',
      credit_notes: clientData.credit_notes || '',
    });
  }

  function handleCancelEdit() {
    if (client) {
      initFormData(client);
    }
    setEditMode(false);
  }

  async function handleSave() {
    if (!formData || !client) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          company: formData.company || null,
          cuit: formData.cuit || null,
          email: formData.email || null,
          phone: formData.phone || null,
          whatsapp: formData.whatsapp || null,
          address: formData.address || null,
          city: formData.city || null,
          province: formData.province,
          postal_code: formData.postal_code || null,
          distance_km: formData.distance_km ? Number(formData.distance_km) : null,
          payment_terms: formData.payment_terms,
          is_recurring: formData.is_recurring,
          notes: formData.notes || null,
          tax_condition: formData.tax_condition,
          has_credit: formData.has_credit,
          credit_days: formData.has_credit ? Number(formData.credit_days) : 0,
          credit_limit: formData.has_credit && formData.credit_limit ? Number(formData.credit_limit) : null,
          credit_notes: formData.has_credit ? formData.credit_notes || null : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      // Refresh client data
      await fetchClient();
      setEditMode(false);
      alert('Cliente actualizado correctamente');
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Error al guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingPage />;
  }

  if (!client || !formData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Cliente no encontrado</p>
        <Link href="/clientes">
          <Button variant="outline" className="mt-4">
            Volver a clientes
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/clientes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              {client.company ? (
                <Building className="w-6 h-6 text-gray-500" />
              ) : (
                <User className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
              {client.company && (
                <p className="text-gray-500">{client.company}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </Button>
          )}
          <Link href={`/cotizaciones/nueva?client=${client.id}`}>
            <Button>
              <FileText className="w-4 h-4 mr-2" />
              Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Órdenes</p>
                    <p className="text-xl font-bold">{client.statistics.total_orders}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total m2</p>
                    <p className="text-xl font-bold">{formatM2(client.statistics.total_m2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Facturado</p>
                    <p className="text-xl font-bold">{formatCurrency(client.statistics.total_revenue)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Edit Form */}
          {editMode && (
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pencil className="w-5 h-5" />
                  Editar Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Información básica */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Información básica</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Nombre *"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                    <Input
                      label="Empresa"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    />
                    <Input
                      label="CUIT"
                      value={formData.cuit}
                      onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                      placeholder="30-12345678-9"
                    />
                    <Select
                      label="Condición fiscal"
                      options={taxConditionOptions}
                      value={formData.tax_condition}
                      onChange={(e) => setFormData({ ...formData, tax_condition: e.target.value as TaxCondition })}
                    />
                  </div>
                </div>

                {/* Contacto */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Contacto</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                    <Input
                      label="Teléfono"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                    <Input
                      label="WhatsApp"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="5491144445555"
                    />
                  </div>
                </div>

                {/* Ubicación */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Ubicación</h4>
                  <div className="space-y-4">
                    <Input
                      label="Dirección"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <Input
                        label="Ciudad"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                      <Select
                        label="Provincia"
                        options={provinceOptions}
                        value={formData.province}
                        onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                      />
                      <Input
                        label="Código Postal"
                        value={formData.postal_code}
                        onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      />
                      <Input
                        label="Distancia (km)"
                        type="number"
                        value={formData.distance_km}
                        onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Condiciones comerciales */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Condiciones comerciales</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select
                      label="Condición de pago"
                      options={paymentTermsOptions}
                      value={formData.payment_terms}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value as PaymentTerms })}
                    />
                    <div className="flex items-center gap-3 pt-6">
                      <input
                        type="checkbox"
                        id="is_recurring"
                        checked={formData.is_recurring}
                        onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="is_recurring" className="text-sm font-medium">
                        Cliente frecuente
                      </label>
                    </div>
                  </div>
                </div>

                {/* Crédito */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Crédito</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="has_credit"
                        checked={formData.has_credit}
                        onChange={(e) => setFormData({ ...formData, has_credit: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="has_credit" className="text-sm font-medium">
                        Habilitar crédito
                      </label>
                    </div>
                    {formData.has_credit && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-7">
                        <Input
                          label="Plazo (días)"
                          type="number"
                          value={formData.credit_days}
                          onChange={(e) => setFormData({ ...formData, credit_days: e.target.value })}
                        />
                        <Input
                          label="Límite ($)"
                          type="number"
                          value={formData.credit_limit}
                          onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value })}
                        />
                        <Input
                          label="Notas de crédito"
                          value={formData.credit_notes}
                          onChange={(e) => setFormData({ ...formData, credit_notes: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Notas */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">Notas</h4>
                  <textarea
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales sobre el cliente..."
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving || !formData.name}>
                  {saving ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Guardar cambios
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Quotes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cotizaciones recientes</CardTitle>
              <Link href={`/cotizaciones?client_id=${client.id}`}>
                <Button variant="ghost" size="sm">Ver todas</Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {client.quotes.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Sin cotizaciones
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {client.quotes.map((quote) => (
                    <Link
                      key={quote.id}
                      href={`/cotizaciones/${quote.id}`}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{quote.quote_number}</p>
                        <p className="text-sm text-gray-500">{formatDate(quote.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(quote.total)}</p>
                        <Badge className={QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}>
                          {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Órdenes recientes</CardTitle>
              <Link href={`/ordenes?client_id=${client.id}`}>
                <Button variant="ghost" size="sm">Ver todas</Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {client.orders.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Sin órdenes
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {client.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/ordenes/${order.id}`}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <p className="font-medium">{order.order_number}</p>
                        <p className="text-sm text-gray-500">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(order.total)}</p>
                        <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                          {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Información de contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.cuit && (
                <div>
                  <p className="text-sm text-gray-500">CUIT</p>
                  <p className="font-medium">{client.cuit}</p>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                    {client.email}
                  </a>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">
                    {client.phone}
                  </a>
                </div>
              )}
              {client.whatsapp && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-500" />
                  <a
                    href={`https://wa.me/${client.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 hover:underline"
                  >
                    WhatsApp
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ubicación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {client.address && <p>{client.address}</p>}
              {client.city && (
                <p>{client.city}, {client.province}</p>
              )}
              {client.distance_km && (
                <p className="text-sm text-gray-500">
                  Distancia: {formatDistance(client.distance_km)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Conditions */}
          <Card>
            <CardHeader>
              <CardTitle>Condiciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Condición fiscal</p>
                <p className="font-medium">{TAX_CONDITION_LABELS[client.tax_condition]}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Condición de pago</p>
                <Badge variant="default">
                  {PAYMENT_TERMS_LABELS[client.payment_terms as PaymentTerms]}
                </Badge>
              </div>
              {client.is_recurring && (
                <Badge variant="success">Cliente frecuente</Badge>
              )}
            </CardContent>
          </Card>

          {/* Credit Info */}
          {client.has_credit && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-blue-700">Crédito</span>
                  <Badge variant="info">Habilitado</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Plazo</p>
                  <p className="font-medium">{client.credit_days} días</p>
                </div>
                {client.credit_limit && (
                  <div>
                    <p className="text-sm text-gray-500">Límite</p>
                    <p className="font-medium">{formatCurrency(client.credit_limit)}</p>
                  </div>
                )}
                {client.credit_notes && (
                  <div>
                    <p className="text-sm text-gray-500">Notas</p>
                    <p className="text-sm">{client.credit_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {client.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
