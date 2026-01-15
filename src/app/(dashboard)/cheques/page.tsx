'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeader } from '@/components/ui/table';
import {
  CreditCard,
  AlertTriangle,
  Building2,
  Banknote,
  ArrowRightLeft,
  Calendar,
  Filter,
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/pricing';
import { formatDate } from '@/lib/utils/dates';
import type { Check, CheckStatus } from '@/lib/types/database';
import { CHECK_STATUS_LABELS, CHECK_STATUS_COLORS } from '@/lib/types/database';

export default function ChequesPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showDueSoon, setShowDueSoon] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState<{ type: 'deposit' | 'cash' | 'endorse'; checkId: string } | null>(null);
  const [modalData, setModalData] = useState({ destination: '', notes: '' });

  useEffect(() => {
    fetchChecks();
  }, [statusFilter, showDueSoon]);

  async function fetchChecks() {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (showDueSoon) params.append('due_soon', 'true');

      const res = await fetch(`/api/checks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setChecks(Array.isArray(data) ? data : []);
      } else {
        setChecks([]);
      }
    } catch (error) {
      console.error('Error fetching checks:', error);
      setChecks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!showModal) return;
    setActionLoading(showModal.checkId);

    try {
      const endpoint = `/api/checks/${showModal.checkId}/${showModal.type}`;
      const body = showModal.type === 'deposit'
        ? { bank_destination: modalData.destination, notes: modalData.notes }
        : showModal.type === 'endorse'
        ? { endorsed_to: modalData.destination, notes: modalData.notes }
        : { notes: modalData.notes };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Error al procesar cheque');
        return;
      }

      setShowModal(null);
      setModalData({ destination: '', notes: '' });
      fetchChecks();
    } catch (error) {
      console.error('Error:', error);
      alert('Error al procesar cheque');
    } finally {
      setActionLoading(null);
    }
  }

  // Calcular resumen
  const summary = {
    total: checks.filter(c => c.status === 'in_portfolio').reduce((sum, c) => sum + c.amount, 0),
    count: checks.filter(c => c.status === 'in_portfolio').length,
    dueSoon: checks.filter(c => c.status === 'in_portfolio' && c.days_until_due !== undefined && c.days_until_due <= 7 && c.days_until_due >= 0).length,
  };

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cheques en Cartera</h1>
        <p className="text-gray-500">Administra los cheques recibidos como forma de pago</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">En cartera</p>
                <p className="text-xl font-bold">{formatCurrency(summary.total)}</p>
                <p className="text-xs text-gray-400">{summary.count} cheques</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={summary.dueSoon > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                summary.dueSoon > 0 ? 'bg-yellow-200' : 'bg-gray-100'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${summary.dueSoon > 0 ? 'text-yellow-700' : 'text-gray-500'}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Próximos a vencer</p>
                <p className="text-xl font-bold">{summary.dueSoon}</p>
                <p className="text-xs text-gray-400">en los próximos 7 días</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Hoy</p>
                <p className="text-xl font-bold">{formatDate(new Date().toISOString())}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Filtros:</span>
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-40"
            >
              <option value="">Todos los estados</option>
              <option value="in_portfolio">En cartera</option>
              <option value="deposited">Depositados</option>
              <option value="cashed">Cobrados</option>
              <option value="endorsed">Endosados</option>
              <option value="rejected">Rechazados</option>
            </Select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDueSoon}
                onChange={(e) => setShowDueSoon(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Solo próximos a vencer</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {checks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No hay cheques para mostrar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco / Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-32">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => {
                  const isOverdue = check.days_until_due !== undefined && check.days_until_due < 0;
                  const isDueSoon = check.days_until_due !== undefined && check.days_until_due >= 0 && check.days_until_due <= 7;

                  return (
                    <TableRow key={check.id} className={isOverdue ? 'bg-red-50' : isDueSoon ? 'bg-yellow-50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{check.bank}</p>
                          <p className="text-sm text-gray-500 font-mono">#{check.number}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p>{check.client?.company || check.client?.name || '-'}</p>
                        {check.holder && check.holder !== check.client?.name && (
                          <p className="text-xs text-gray-500">Librador: {check.holder}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className={isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-yellow-700' : ''}>
                          {formatDate(check.due_date)}
                        </p>
                        {check.days_until_due !== undefined && (
                          <p className="text-xs text-gray-500">
                            {check.days_until_due === 0
                              ? 'Vence hoy'
                              : check.days_until_due > 0
                              ? `En ${check.days_until_due} días`
                              : `Vencido hace ${Math.abs(check.days_until_due)} días`}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(check.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge className={CHECK_STATUS_COLORS[check.status as CheckStatus]}>
                          {CHECK_STATUS_LABELS[check.status as CheckStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {check.status === 'in_portfolio' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => setShowModal({ type: 'deposit', checkId: check.id })}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Depositar"
                            >
                              <Building2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowModal({ type: 'cash', checkId: check.id })}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Cobrar"
                            >
                              <Banknote className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowModal({ type: 'endorse', checkId: check.id })}
                              className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                              title="Endosar"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {check.status !== 'in_portfolio' && check.exit_to && (
                          <p className="text-xs text-gray-500">
                            → {check.exit_to}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  {showModal.type === 'deposit' && 'Depositar cheque'}
                  {showModal.type === 'cash' && 'Cobrar cheque'}
                  {showModal.type === 'endorse' && 'Endosar cheque'}
                </span>
                <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(showModal.type === 'deposit' || showModal.type === 'endorse') && (
                <Input
                  label={showModal.type === 'deposit' ? 'Banco destino' : 'Endosado a'}
                  value={modalData.destination}
                  onChange={(e) => setModalData({ ...modalData, destination: e.target.value })}
                  placeholder={showModal.type === 'deposit' ? 'Ej: Banco Nacion' : 'Nombre del proveedor'}
                  required
                />
              )}
              <Input
                label="Notas (opcional)"
                value={modalData.notes}
                onChange={(e) => setModalData({ ...modalData, notes: e.target.value })}
              />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowModal(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleAction}
                  disabled={
                    actionLoading === showModal.checkId ||
                    ((showModal.type === 'deposit' || showModal.type === 'endorse') && !modalData.destination)
                  }
                >
                  {actionLoading === showModal.checkId ? <LoadingSpinner size="sm" /> : 'Confirmar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
