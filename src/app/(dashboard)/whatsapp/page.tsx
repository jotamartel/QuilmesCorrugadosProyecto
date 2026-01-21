'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Phone, Calendar, DollarSign, Box, ArrowRight, RefreshCw } from 'lucide-react';

interface WhatsAppCommunication {
  id: string;
  channel: string;
  direction: 'inbound' | 'outbound';
  content: string;
  metadata: {
    phone?: string;
    state?: string;
    parsed?: {
      dimensions?: { length: number; width: number; height: number };
      quantity?: number;
    };
    quote?: {
      total: number;
      totalM2: number;
    };
  };
  created_at: string;
}

interface ConversationGroup {
  phone: string;
  messages: WhatsAppCommunication[];
  lastMessage: WhatsAppCommunication;
  hasQuote: boolean;
  totalQuoted: number;
}

export default function WhatsAppPage() {
  const [communications, setCommunications] = useState<WhatsAppCommunication[]>([]);
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  const fetchCommunications = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/communications?channel=whatsapp');
      if (response.ok) {
        const data = await response.json();
        setCommunications(data);
        groupConversations(data);
      }
    } catch (error) {
      console.error('Error fetching communications:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupConversations = (data: WhatsAppCommunication[]) => {
    const grouped: Record<string, WhatsAppCommunication[]> = {};

    data.forEach((comm) => {
      const phone = comm.metadata?.phone || 'unknown';
      if (!grouped[phone]) {
        grouped[phone] = [];
      }
      grouped[phone].push(comm);
    });

    const conversationList: ConversationGroup[] = Object.entries(grouped).map(([phone, messages]) => {
      const sortedMessages = messages.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const lastMessage = sortedMessages[sortedMessages.length - 1];
      const quotedMessages = messages.filter((m) => m.metadata?.quote);
      const totalQuoted = quotedMessages.reduce((sum, m) => sum + (m.metadata?.quote?.total || 0), 0);

      return {
        phone,
        messages: sortedMessages,
        lastMessage,
        hasQuote: quotedMessages.length > 0,
        totalQuoted,
      };
    });

    // Ordenar por ultimo mensaje
    conversationList.sort(
      (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );

    setConversations(conversationList);
  };

  useEffect(() => {
    fetchCommunications();
  }, []);

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

  const selectedConv = conversations.find((c) => c.phone === selectedConversation);

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
        <button
          onClick={fetchCommunications}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{conversations.length}</p>
              <p className="text-sm text-gray-500">Conversaciones</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Box className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {conversations.filter((c) => c.hasQuote).length}
              </p>
              <p className="text-sm text-gray-500">Con cotizacion</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                ${conversations.reduce((sum, c) => sum + c.totalQuoted, 0).toLocaleString('es-AR')}
              </p>
              <p className="text-sm text-gray-500">Total cotizado</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{communications.length}</p>
              <p className="text-sm text-gray-500">Mensajes totales</p>
            </div>
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
                <p>No hay conversaciones aun</p>
                <p className="text-sm mt-1">Los mensajes de WhatsApp apareceran aqui</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.phone}
                  onClick={() => setSelectedConversation(conv.phone)}
                  className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                    selectedConversation === conv.phone ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Phone className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{formatPhone(conv.phone)}</p>
                        <p className="text-sm text-gray-500 truncate max-w-[180px]">
                          {conv.lastMessage.direction === 'inbound' ? '' : 'Tu: '}
                          {conv.lastMessage.content?.substring(0, 30)}...
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{formatDate(conv.lastMessage.created_at)}</p>
                      {conv.hasQuote && (
                        <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                          Cotizado
                        </span>
                      )}
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
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Phone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{formatPhone(selectedConv.phone)}</p>
                    <p className="text-sm text-gray-500">{selectedConv.messages.length} mensajes</p>
                  </div>
                </div>
                <a
                  href={`https://wa.me/${selectedConv.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir WhatsApp
                </a>
              </div>
              <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto bg-gray-50">
                {selectedConv.messages.map((msg) => (
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
              {selectedConv.hasQuote && (
                <div className="p-4 border-t border-gray-200 bg-green-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700 font-medium">Total cotizado en esta conversacion</p>
                      <p className="text-2xl font-bold text-green-800">
                        ${selectedConv.totalQuoted.toLocaleString('es-AR')}
                      </p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      Convertir a cotizacion
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
                <p className="text-lg font-medium">Selecciona una conversacion</p>
                <p className="text-sm mt-1">Elige una conversacion de la lista para ver los detalles</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
