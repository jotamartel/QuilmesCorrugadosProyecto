'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LoadingPage } from '@/components/ui/loading';
import { Plus, Eye, Search, ArrowLeft } from 'lucide-react';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_COLORS } from '@/lib/utils/format';
import type { Quote, QuoteStatus } from '@/lib/types/database';

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviada' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'rejected', label: 'Rechazada' },
  { value: 'expired', label: 'Expirada' },
  { value: 'converted', label: 'Convertida' },
];

export default function CotizacionesListaPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchQuotes();
  }, [statusFilter]);

  async function fetchQuotes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/quotes?${params.toString()}`);
      const data = await res.json();
      setQuotes(data.data || []);
    } catch (error) {
      console.error('Error fetching quotes:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredQuotes = quotes.filter(quote => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      quote.quote_number.toLowerCase().includes(search) ||
      (quote.client as { name?: string; company?: string } | null)?.name?.toLowerCase().includes(search) ||
      (quote.client as { name?: string; company?: string } | null)?.company?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/cotizaciones">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
            <p className="text-gray-500">Lista de cotizaciones del sistema</p>
          </div>
        </div>
        <Link href="/cotizaciones/nueva">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Cotización
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por número o cliente..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="Filtrar por estado"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Cotizaciones ({filteredQuotes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingPage />
          ) : filteredQuotes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No se encontraron cotizaciones
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>m2</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">
                      {quote.quote_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {(quote.client as { name: string } | null)?.name || 'Sin cliente'}
                        </p>
                        {(quote.client as { company?: string } | null)?.company && (
                          <p className="text-xs text-gray-500">
                            {(quote.client as { company: string }).company}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatM2(quote.total_m2)}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(quote.total)}
                    </TableCell>
                    <TableCell>
                      <Badge className={QUOTE_STATUS_COLORS[quote.status as QuoteStatus]}>
                        {QUOTE_STATUS_LABELS[quote.status as QuoteStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatDate(quote.created_at)}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatDate(quote.valid_until)}
                    </TableCell>
                    <TableCell>
                      <Link href={`/cotizaciones/${quote.id}`}>
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
