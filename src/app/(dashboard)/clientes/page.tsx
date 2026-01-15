'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Plus, Eye, Search, Building, User, Download, Upload } from 'lucide-react';
import { formatDistance, PAYMENT_TERMS_LABELS } from '@/lib/utils/format';
import type { Client, PaymentTerms } from '@/lib/types/database';

// Columnas del CSV para importar/exportar
const CSV_COLUMNS = [
  'name', 'company', 'cuit', 'email', 'phone', 'whatsapp',
  'address', 'city', 'province', 'distance_km', 'payment_terms', 'is_recurring', 'notes'
];

const CSV_HEADERS = [
  'Nombre', 'Empresa', 'CUIT', 'Email', 'Teléfono', 'WhatsApp',
  'Dirección', 'Ciudad', 'Provincia', 'Distancia (km)', 'Condición de pago', 'Es frecuente', 'Notas'
];

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      setClients(data.data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  }

  // Exportar clientes a CSV
  function exportToCSV() {
    // Crear contenido CSV
    const rows = [CSV_HEADERS.join(',')];

    for (const client of clients) {
      const row = CSV_COLUMNS.map(col => {
        const value = client[col as keyof Client];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'si' : 'no';
        // Escapar comillas y envolver en comillas si contiene comas o saltos de linea
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Parsear CSV
  function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (insideQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++;
        } else if (char === '"') {
          insideQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentRow.push(currentCell.trim());
          if (currentRow.some(cell => cell !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
          if (char === '\r') i++;
        } else if (char !== '\r') {
          currentCell += char;
        }
      }
    }

    // Ultima fila
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  // Importar clientes desde CSV
  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length < 2) {
        setImportResult({ success: 0, errors: ['El archivo esta vacio o solo tiene encabezados'] });
        return;
      }

      // Saltar encabezado
      const dataRows = rows.slice(1);
      let successCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2; // +2 porque saltamos encabezado y empezamos en 1

        // Mapear columnas a objeto
        const clientData: Record<string, string | number | boolean | null> = {};
        for (let j = 0; j < CSV_COLUMNS.length && j < row.length; j++) {
          const col = CSV_COLUMNS[j];
          let value: string | number | boolean | null = row[j];

          // Convertir tipos
          if (col === 'distance_km') {
            value = value ? parseFloat(value) || null : null;
          } else if (col === 'is_recurring') {
            value = value.toLowerCase() === 'si' || value.toLowerCase() === 'true' || value === '1';
          } else if (value === '') {
            value = null;
          }

          clientData[col] = value;
        }

        // Validar nombre requerido
        if (!clientData.name) {
          errors.push(`Fila ${rowNum}: El nombre es requerido`);
          continue;
        }

        // Validar payment_terms
        const validPaymentTerms = ['contado', 'cheque_30', 'cheque_60', 'cuenta_corriente'];
        if (clientData.payment_terms && !validPaymentTerms.includes(clientData.payment_terms as string)) {
          clientData.payment_terms = 'contado';
        }
        if (!clientData.payment_terms) {
          clientData.payment_terms = 'contado';
        }

        // Default province
        if (!clientData.province) {
          clientData.province = 'Buenos Aires';
        }

        try {
          const res = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientData),
          });

          if (res.ok) {
            successCount++;
          } else {
            const data = await res.json();
            errors.push(`Fila ${rowNum}: ${data.error || 'Error desconocido'}`);
          }
        } catch {
          errors.push(`Fila ${rowNum}: Error de conexion`);
        }
      }

      setImportResult({ success: successCount, errors });

      // Recargar clientes si hubo exito
      if (successCount > 0) {
        await fetchClients();
      }
    } catch (error) {
      console.error('Error importing CSV:', error);
      setImportResult({ success: 0, errors: ['Error al leer el archivo CSV'] });
    } finally {
      setImporting(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  const filteredClients = clients.filter(client => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(search) ||
      client.company?.toLowerCase().includes(search) ||
      client.cuit?.includes(search) ||
      client.email?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500">Gestiona la base de clientes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportToCSV} disabled={clients.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <span className="mr-2"><LoadingSpinner size="sm" /></span>
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Importar CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <Link href="/clientes/nuevo">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Cliente
            </Button>
          </Link>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <Card className={importResult.errors.length > 0 ? 'border-yellow-300' : 'border-green-300'}>
          <CardContent className="p-4">
            <div className="space-y-2">
              <p className="font-medium">
                {importResult.success > 0 ? (
                  <span className="text-green-600">
                    Se importaron {importResult.success} cliente(s) correctamente.
                  </span>
                ) : (
                  <span className="text-red-600">No se importaron clientes.</span>
                )}
              </p>
              {importResult.errors.length > 0 && (
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">Errores ({importResult.errors.length}):</p>
                  <ul className="list-disc list-inside max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>... y {importResult.errors.length - 10} errores mas</li>
                    )}
                  </ul>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImportResult(null)}
                className="text-gray-500"
              >
                Cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, empresa, CUIT o email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes ({filteredClients.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingPage />
          ) : filteredClients.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No se encontraron clientes
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Distancia</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          {client.company ? (
                            <Building className="w-5 h-5 text-gray-500" />
                          ) : (
                            <User className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          {client.company && (
                            <p className="text-sm text-gray-500">{client.company}</p>
                          )}
                          {client.cuit && (
                            <p className="text-xs text-gray-400">CUIT: {client.cuit}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {client.email && <p>{client.email}</p>}
                        {client.phone && <p className="text-gray-500">{client.phone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.city || '-'}
                    </TableCell>
                    <TableCell>
                      {client.distance_km ? formatDistance(client.distance_km) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {PAYMENT_TERMS_LABELS[client.payment_terms as PaymentTerms]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {client.is_recurring && (
                        <Badge variant="success">Frecuente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/clientes/${client.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
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
