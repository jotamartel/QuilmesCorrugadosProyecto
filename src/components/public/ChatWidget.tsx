'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Send, X, Download, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { trackEvent } from '@/lib/utils/tracking';

const WHATSAPP_NUMBER = '5491169249801';

/** Parámetros de atribución para campaña SEM (UTM + página) */
function getAttributionParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {
    pagePath: window.location.pathname,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmContent: params.get('utm_content') || '',
    utmTerm: params.get('utm_term') || '',
  };
  return out;
}
const STORAGE_KEY = 'quilmes-chat-history';
const INITIAL_VISIBLE = 20;
const LOAD_CHUNK = 20;
const SCROLL_THRESHOLD = 80;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** URL para descargar plantilla PDF del desplegado (solo en respuestas del asistente) */
  templateUrl?: string;
}

function loadStoredMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: msgs, lastUpdated: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);

  const displayedMessages = messages.slice(-visibleCount);
  const hasMore = messages.length > visibleCount;
  const allLoaded = messages.length > 0 && visibleCount >= messages.length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollRestoreRef.current) {
      const { height: prevHeight, top: prevTop } = scrollRestoreRef.current;
      scrollRestoreRef.current = null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (el && el.scrollHeight > prevHeight) {
            el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
          }
        });
      });
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, visibleCount]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMoreRef.current || !hasMore) return;
    if (el.scrollTop < SCROLL_THRESHOLD) {
      loadingMoreRef.current = true;
      scrollRestoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setVisibleCount((v) => Math.min(v + LOAD_CHUNK, messages.length));
    }
  }, [hasMore, messages.length]);

  useEffect(() => {
    if (loadingMoreRef.current) {
      loadingMoreRef.current = false;
    }
  }, [visibleCount]);

  useEffect(() => {
    if (isOpen && !loading) {
      inputRef.current?.focus();
    }
  }, [isOpen, loading, messages.length]);

  const persistAndSetMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    setMessages((prev) => {
      const next = updater(prev);
      saveMessages(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen || restoreChecked) return;
    const stored = loadStoredMessages();
    if (stored.length > 0 && messages.length === 0) {
      setShowRestorePrompt(true);
    }
  }, [isOpen, restoreChecked, messages.length]);

  const handleRestoreYes = useCallback(() => {
    const stored = loadStoredMessages();
    if (stored.length > 0) {
      setMessages(stored);
      setVisibleCount(Math.min(INITIAL_VISIBLE, stored.length));
    }
    setShowRestorePrompt(false);
    setRestoreChecked(true);
  }, []);

  const handleRestoreNo = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setShowRestorePrompt(false);
    setRestoreChecked(true);
  }, []);

  const handleDownloadHistory = useCallback(() => {
    const lines = messages.map((m) => {
      const label = m.role === 'user' ? 'Vos' : 'Asistente';
      return `[${label}]\n${m.content}`;
    });
    const blob = new Blob([lines.join('\n\n---\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-chat-quilmes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const attribution = getAttributionParams();
    trackEvent('chat_message_sent', { ...attribution, messageLength: text.length });

    setInput('');
    persistAndSetMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages,
          attribution,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error');
      }

      persistAndSetMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          templateUrl: data.templateUrl,
        },
      ]);
    } catch (error) {
      persistAndSetMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'No pude procesar tu mensaje. Escribinos por WhatsApp o visitá /contacto.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Burbuja flotante (reemplaza WhatsApp) - bottom-right */}
      <button
        onClick={() => {
          const wasOpen = isOpen;
          setIsOpen(!isOpen);
          if (!wasOpen) {
            trackEvent('chat_opened', getAttributionParams());
          }
        }}
        className="fixed bottom-6 right-6 z-[60] flex items-center justify-center w-14 h-14 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 md:bottom-6 md:right-6"
        aria-label="Abrir chat"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-7 h-7" />
        )}
      </button>

      {/* Panel de chat - Desktop: panel derecho 420px | Mobile: full-screen WhatsApp-like */}
      {isOpen && (
        <>
          {/* Backdrop mobile */}
          <div
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 md:top-auto md:left-auto md:w-[420px] md:h-[min(calc(100vh-8rem),640px)] md:min-h-[520px] md:rounded-2xl z-50 bg-white md:shadow-2xl md:border md:border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 p-4 bg-[#075E54] text-white flex items-center gap-3">
            <button
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1 -ml-1 rounded-lg hover:bg-white/10"
              aria-label="Cerrar"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold">Asistente Quilmes Corrugados</h3>
              <p className="text-xs text-white/80">Respondo tus consultas sobre cajas</p>
            </div>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            tabIndex={0}
            className="flex-1 min-h-0 overflow-y-scroll overflow-x-hidden p-4 space-y-4 bg-gray-50 overscroll-contain [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {allLoaded && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={handleDownloadHistory}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar historial completo
                </button>
              </div>
            )}
            {showRestorePrompt && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-center">
                <p className="text-sm font-medium text-slate-800 mb-3">
                  ¿Querés cargar la última conversación?
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleRestoreYes}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-lg"
                  >
                    Sí, cargar
                  </button>
                  <button
                    onClick={handleRestoreNo}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg"
                  >
                    No, empezar de nuevo
                  </button>
                </div>
              </div>
            )}
            {messages.length === 0 && !showRestorePrompt && (
              <div className="text-center text-gray-500 text-sm py-8">
                <p className="font-medium mb-1">¡Hola!</p>
                <p>Preguntame lo que necesites: precios, envíos, producción, formas de pago.</p>
                <p className="mt-2 text-xs">Cotizá en la página o visitá /contacto</p>
              </div>
            )}
            {displayedMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[#005C4B] text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === 'assistant' && msg.templateUrl && (
                    <a
                      href={msg.templateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-800 font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Descargar plantilla PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          <div
            className={`flex-shrink-0 border-t border-gray-200 bg-white transition-[padding] md:p-4 ${
              isInputFocused ? 'p-2 md:p-4' : 'p-4'
            }`}
          >
            <div className="flex gap-2 items-stretch min-h-0">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Escribí tu consulta..."
                className="flex-1 min-w-0 px-4 py-2.5 md:py-3 pr-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm"
                disabled={loading}
                autoFocus
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="flex-shrink-0 p-2.5 md:p-3 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors self-center"
                aria-label="Enviar"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <Link
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 flex items-center justify-center gap-2 text-sm text-green-600 hover:text-green-700 ${
                isInputFocused ? 'hidden md:flex mt-0 md:mt-2' : ''
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              Continuar por WhatsApp
            </Link>
          </div>
        </div>
        </>
      )}
    </>
  );
}
