'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  MessageCircle,
  Phone,
  DollarSign,
  Box,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Search,
  Filter,
  Download,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';

interface WhatsAppConversation {
  id: string;
  phone_number: string;
  step: string;
  dimensions?: { length: number; width: number; height: number };
  quantity?: number;
  has_printing?: boolean;
  last_quote_total?: number;
  last_quote_m2?: number;
  attended: boolean;
  attended_at?: string;
  attended_by?: string;
  notes?: string;
  last_interaction: string;
  created_at: string;
  // Stats calculadas
  message_count: number;
  quotes_count: number;
  total_quoted: number;
  needs_advisor: boolean;
}

interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Stats {
  total: number;
  needsAdvisor: number;
  quoted: number;
  unattended: number;
  totalQuotedValue: number;
}

type FilterType = 'all' | 'needs_advisor' | 'quoted' | 'unattended';

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  // Filtros
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('filter', filter);
      if (search) params.append('search', search);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const response = await fetch(`/api/whatsapp/conversations?${params}`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search, dateFrom, dateTo]);

  const fetchMessages = async (phoneNumber: string) => {
    try {
      const response = await fetch(`/api/communications?channel=whatsapp&phone=${encodeURIComponent(phoneNumber)}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const markAsAttended = async (phoneNumber: string, notes?: string) => {
    try {
      const response = await fetch('/api/whatsapp/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, attended: true, notes }),
      });

      if (response.ok) {
        fetchConversations();
      }
    } catch (error) {
      console.error('Error marking as attended:', error);
    }
  };

  const markAsUnattended = async (phoneNumber: string) => {
    try {
      const response = await fetch('/api/whatsapp/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, attended: false }),
      });

      if (response.ok) {
        fetchConversations();
      }
    } catch (error) {
      console.error('Error marking as unattended:', error);
    }
  };

  const exportToCSV = () => {
    const headers = ['Teléfono', 'Última interacción', 'Mensajes', 'Cotizaciones', 'Total cotizado', 'Pide asesor', 'Atendido'];
    const rows = conversations.map(conv => [
      conv.phone_number,
      new Date(conv.last_interaction).toLocaleString('es-AR'),
      conv.message_count,
      conv.quotes_count,
      conv.total_quoted,
      conv.needs_advisor ? 'Sí' : 'No',
      conv.attended ? 'Sí' : 'No',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    // BOM (Byte Order Mark) para que Excel reconozca UTF-8 correctamente
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `whatsapp-conversaciones-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
    }
  }, [selectedConversation]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es-AR');
  };

  const formatPhone = (phone: string) => {
    if (phone.startsWith('+54')) {
      return phone.replace('+54', '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2-$3');
    }
    return phone;
  };

  const selectedConv = conversations.find((c) => c.phone_number === selectedConversation);

  const filterButtons: { key: FilterType; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'Todas', icon: <MessageCircle className="w-4 h-4" /> },
    { key: 'needs_advisor', label: 'Piden asesor', icon: <AlertCircle className="w-4 h-4" /> },
    { key: 'quoted', label: 'Con cotización', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'unattended', label: 'Sin atender', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-7 h-7 text-green-600" />
            Cotizaciones WhatsApp
          </h1>
          <p className="text-gray-600 mt-1">Conversaciones y cotizaciones via WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={fetchConversations}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <MessageCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Conversaciones</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.needsAdvisor}</p>
                <p className="text-sm text-gray-500">Piden asesor</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Box className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.quoted}</p>
                <p className="text-sm text-gray-500">Con cotización</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.unattended}</p>
                <p className="text-sm text-gray-500">Sin atender</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.totalQuotedValue.toLocaleString('es-AR')}
                </p>
                <p className="text-sm text-gray-500">Total cotizado</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Filtros rápidos */}
          <div className="flex gap-2">
            {filterButtons.map(btn => (
              <button
                key={btn.key}
                onClick={() => setFilter(btn.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === btn.key
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </div>

          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>

          {/* Filtro de fechas */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations list */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Conversaciones</h2>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Cargando...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No hay conversaciones</p>
                <p className="text-sm mt-1">Ajusta los filtros o espera nuevos mensajes</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv.phone_number)}
                  className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                    selectedConversation === conv.phone_number ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        conv.needs_advisor && !conv.attended
                          ? 'bg-red-100'
                          : conv.attended
                          ? 'bg-gray-100'
                          : 'bg-green-100'
                      }`}>
                        {conv.attended ? (
                          <CheckCircle className="w-5 h-5 text-gray-400" />
                        ) : conv.needs_advisor ? (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <Phone className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        <p className={`font-medium ${conv.attended ? 'text-gray-500' : 'text-gray-900'}`}>
                          {formatPhone(conv.phone_number)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {conv.message_count} msgs · {conv.quotes_count} cot.
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{formatDate(conv.last_interaction)}</p>
                      <div className="flex flex-wrap gap-1 mt-1 justify-end">
                        {conv.needs_advisor && !conv.attended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Asesor
                          </span>
                        )}
                        {conv.quotes_count > 0 && (
                          <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            ${conv.total_quoted.toLocaleString('es-AR')}
                          </span>
                        )}
                        {conv.attended && (
                          <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                            Atendido
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Conversation detail */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {selectedConv ? (
            <>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedConv.needs_advisor && !selectedConv.attended ? 'bg-red-100' : 'bg-green-100'
                  }`}>
                    {selectedConv.needs_advisor && !selectedConv.attended ? (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Phone className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{formatPhone(selectedConv.phone_number)}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">{selectedConv.message_count} mensajes</p>
                      {selectedConv.needs_advisor && !selectedConv.attended && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          Solicita asesor
                        </span>
                      )}
                      {selectedConv.attended && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                          Atendido
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConv.attended ? (
                    <button
                      onClick={() => markAsUnattended(selectedConv.phone_number)}
                      className="flex items-center gap-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Desmarcar
                    </button>
                  ) : (
                    <button
                      onClick={() => markAsAttended(selectedConv.phone_number)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Marcar atendido
                    </button>
                  )}
                  <a
                    href={`https://wa.me/${selectedConv.phone_number.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Abrir WhatsApp
                  </a>
                </div>
              </div>
              <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto bg-gray-50">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.direction === 'outbound'
                          ? 'bg-green-600 text-white'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.direction === 'outbound' ? 'text-green-200' : 'text-gray-400'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedConv.total_quoted > 0 && (
                <div className="p-4 border-t border-gray-200 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700 font-medium">Total cotizado en esta conversación</p>
                      <p className="text-2xl font-bold text-green-800">
                        ${selectedConv.total_quoted.toLocaleString('es-AR')}
                      </p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      Convertir a cotización
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center p-8 text-gray-500">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Selecciona una conversación</p>
                <p className="text-sm mt-1">Elige una conversación de la lista para ver los detalles</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
