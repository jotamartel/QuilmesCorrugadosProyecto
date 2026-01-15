'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading';
import { ArrowLeft } from 'lucide-react';

const paymentTermsOptions = [
  { value: 'contado', label: 'Contado' },
  { value: 'cheque_30', label: 'Cheque a 30 dias' },
];

const provinceOptions = [
  { value: 'Buenos Aires', label: 'Buenos Aires' },
  { value: 'CABA', label: 'CABA' },
  { value: 'Cordoba', label: 'Cordoba' },
  { value: 'Santa Fe', label: 'Santa Fe' },
  { value: 'Mendoza', label: 'Mendoza' },
  { value: 'Otro', label: 'Otra provincia' },
];

export default function NuevoClientePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    cuit: '',
    email: '',
    phone: '',
    whatsapp: '',
    address: '',
    city: '',
    province: 'Buenos Aires',
    distance_km: '',
    payment_terms: 'contado',
    is_recurring: false,
    notes: '',
  });

  function updateField(field: string, value: string | boolean) {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  }

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalido';
    }

    if (formData.cuit && formData.cuit.replace(/\D/g, '').length !== 11) {
      newErrors.cuit = 'CUIT debe tener 11 digitos';
    }

    if (formData.distance_km && (isNaN(Number(formData.distance_km)) || Number(formData.distance_km) < 0)) {
      newErrors.distance_km = 'Distancia invalida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          distance_km: formData.distance_km ? parseInt(formData.distance_km) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Error al guardar');
        return;
      }

      router.push(`/clientes/${data.id}`);
    } catch (error) {
      console.error('Error:', error);
      alert('Error al guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/clientes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Cliente</h1>
          <p className="text-gray-500">Registra un nuevo cliente en el sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información básica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Nombre *"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              error={errors.name}
              placeholder="Juan Perez"
            />
            <Input
              label="Empresa"
              value={formData.company}
              onChange={(e) => updateField('company', e.target.value)}
              placeholder="Empresa S.A."
            />
            <Input
              label="CUIT"
              value={formData.cuit}
              onChange={(e) => updateField('cuit', e.target.value)}
              error={errors.cuit}
              placeholder="30-12345678-9"
            />
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              error={errors.email}
              placeholder="email@empresa.com"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Teléfono"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="011-4444-5555"
              />
              <Input
                label="WhatsApp"
                value={formData.whatsapp}
                onChange={(e) => updateField('whatsapp', e.target.value)}
                placeholder="5491144445555"
              />
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ubicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Dirección"
              value={formData.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Av. Mitre 1234"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Ciudad"
                value={formData.city}
                onChange={(e) => updateField('city', e.target.value)}
                placeholder="San Fernando"
              />
              <Select
                label="Provincia"
                options={provinceOptions}
                value={formData.province}
                onChange={(e) => updateField('province', e.target.value)}
              />
            </div>
            <Input
              label="Distancia desde fabrica (km)"
              type="number"
              value={formData.distance_km}
              onChange={(e) => updateField('distance_km', e.target.value)}
              error={errors.distance_km}
              hint="Para calcular el costo de envio"
              placeholder="25"
            />
          </CardContent>
        </Card>

        {/* Payment */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Condiciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="Condicion de pago"
              options={paymentTermsOptions}
              value={formData.payment_terms}
              onChange={(e) => updateField('payment_terms', e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_recurring"
                checked={formData.is_recurring}
                onChange={(e) => updateField('is_recurring', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_recurring" className="text-sm">
                Cliente frecuente
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Notas internas sobre el cliente..."
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Link href="/clientes">
              <Button variant="outline" type="button">
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? <LoadingSpinner size="sm" /> : 'Guardar Cliente'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
