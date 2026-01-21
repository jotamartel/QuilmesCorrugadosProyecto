'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Clock,
  Zap,
  Building,
  Mail,
} from 'lucide-react';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  owner_email: string | null;
  owner_company: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

interface NewKeyResponse {
  api_key: string;
  key_data: ApiKey;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formRateMinute, setFormRateMinute] = useState('100');
  const [formRateDay, setFormRateDay] = useState('10000');

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    try {
      const res = await fetch('/api/api-keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Error fetching keys:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createKey() {
    if (!formName.trim() || formName.length < 3) {
      alert('El nombre debe tener al menos 3 caracteres');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          owner_email: formEmail || null,
          owner_company: formCompany || null,
          rate_limit_per_minute: parseInt(formRateMinute) || 100,
          rate_limit_per_day: parseInt(formRateDay) || 10000,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNewKeyData(data);
        setShowCreateForm(false);
        fetchKeys();
        // Reset form
        setFormName('');
        setFormEmail('');
        setFormCompany('');
        setFormRateMinute('100');
        setFormRateDay('10000');
      } else {
        alert(data.error || 'Error al crear API key');
      }
    } catch (error) {
      console.error('Error creating key:', error);
      alert('Error al crear API key');
    } finally {
      setCreating(false);
    }
  }

  async function toggleKey(id: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      });

      if (res.ok) {
        setKeys(keys.map(k =>
          k.id === id ? { ...k, is_active: !currentActive } : k
        ));
      }
    } catch (error) {
      console.error('Error toggling key:', error);
    }
  }

  async function deleteKey(id: string, name: string) {
    if (!confirm(`¿Eliminar la API key "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/api-keys?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setKeys(keys.filter(k => k.id !== id));
      }
    } catch (error) {
      console.error('Error deleting key:', error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Key className="w-6 h-6" />
            API Keys
          </h1>
          <p className="text-gray-500">
            Gestionar claves de acceso para la API v1
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nueva API Key
        </Button>
      </div>

      {/* Modal de nueva key creada */}
      {newKeyData && (
        <Card className="border-2 border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-700 flex items-center gap-2">
              <Check className="w-5 h-5" />
              API Key creada exitosamente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-white rounded-lg border">
              <code className="flex-1 text-sm font-mono break-all">
                {newKeyData.api_key}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(newKeyData.api_key)}
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Importante:</strong> Esta es la única vez que verás esta clave completa.
                Guárdala en un lugar seguro ahora.
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setNewKeyData(null)}
              className="w-full"
            >
              Entendido, ya la guardé
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Formulario de creación */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Crear nueva API Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: ChatGPT Integration"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email del propietario
                </label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contacto@empresa.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empresa
                </label>
                <Input
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="Nombre de la empresa"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Límite/minuto
                  </label>
                  <Input
                    type="number"
                    value={formRateMinute}
                    onChange={(e) => setFormRateMinute(e.target.value)}
                    min="1"
                    max="1000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Límite/día
                  </label>
                  <Input
                    type="number"
                    value={formRateDay}
                    onChange={(e) => setFormRateDay(e.target.value)}
                    min="1"
                    max="100000"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancelar
              </Button>
              <Button onClick={createKey} disabled={creating}>
                {creating ? <LoadingSpinner size="sm" /> : 'Crear API Key'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            API Keys ({keys.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {keys.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay API keys creadas</p>
              <p className="text-sm mt-1">Crea una para dar acceso extendido a clientes</p>
            </div>
          ) : (
            <div className="divide-y">
              {keys.map((key) => (
                <div key={key.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{key.name}</span>
                        <Badge variant={key.is_active ? 'success' : 'default'}>
                          {key.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                        {key.expires_at && new Date(key.expires_at) < new Date() && (
                          <Badge variant="error">Expirada</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 font-mono mb-2">
                        {key.key_prefix}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {key.owner_company && (
                          <span className="flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            {key.owner_company}
                          </span>
                        )}
                        {key.owner_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {key.owner_email}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {key.rate_limit_per_minute}/min, {key.rate_limit_per_day}/día
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Creada: {new Date(key.created_at).toLocaleDateString('es-AR')}
                        </span>
                        {key.last_used_at && (
                          <span className="flex items-center gap-1 text-green-600">
                            Último uso: {new Date(key.last_used_at).toLocaleDateString('es-AR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleKey(key.id, key.is_active)}
                        title={key.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {key.is_active ? (
                          <ToggleRight className="w-5 h-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteKey(key.id, key.name)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Información de uso */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo usar una API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-gray-600">
            Incluye la API key en el header <code className="bg-gray-100 px-1 rounded">X-API-Key</code> de tus requests:
          </p>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
{`curl -X POST https://quilmes-corrugados.vercel.app/api/v1/quote \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: qc_live_xxxxxxxxxx" \\
  -d '{"boxes": [{"length_mm": 400, "width_mm": 300, "height_mm": 200, "quantity": 1000}]}'`}
          </pre>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Sin API key: 10 req/min</span>
            <span>Con API key: según configuración (por defecto 100 req/min)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
