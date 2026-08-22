'use client';

/**
 * Lo que le preguntan al asistente y no sabe contestar.
 *
 * Las de arriba son las que están esperando: cuando alguien escribe una
 * respuesta acá, el asistente la usa a partir de ese momento con cualquier
 * cliente que pregunte algo parecido.
 *
 * Por eso el texto se escribe EN GENERAL y no para la persona que preguntó. Es
 * la razón por la que esto es una pantalla aparte y no un botón dentro de la
 * conversación: contestarle a alguien y enseñarle al asistente son dos cosas
 * distintas, y la mayoría de las respuestas sirven para lo primero y no para lo
 * segundo.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingPage } from '@/components/ui/loading';
import { MessageCircleQuestion, Check, X, Pencil, Repeat2 } from 'lucide-react';

interface Pendiente {
  id: string;
  pregunta: string;
  contexto: string | null;
  canal: string;
  telefono: string | null;
  veces_preguntada: number;
  ultima_vez: string;
  creada_en: string;
}

interface Respondida {
  id: string;
  pregunta: string;
  respuesta: string;
  respondida_por: string | null;
  respondida_en: string | null;
  veces_preguntada: number;
  canal: string;
}

function cuando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return 'recién';
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

export default function ConocimientoPage() {
  const [cargando, setCargando] = useState(true);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [respondidas, setRespondidas] = useState<Respondida[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/conocimiento');
      if (!res.ok) throw new Error('no se pudo cargar');
      const data = await res.json();
      setPendientes(data.pendientes || []);
      setRespondidas(data.respondidas || []);
    } catch {
      setError('No se pudo cargar la lista.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (id: string) => {
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/conocimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, respuesta: texto.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'No se pudo guardar.'); return; }
      setEditando(null);
      setTexto('');
      cargar();
    } catch {
      setError('No se pudo guardar. Revisá la conexión.');
    } finally {
      setGuardando(false);
    }
  };

  const descartar = async (id: string) => {
    try {
      await fetch(`/api/conocimiento?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      cargar();
    } catch {
      setError('No se pudo descartar.');
    }
  };

  if (cargando) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Preguntas sin responder</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Lo que le preguntaron al asistente y no supo contestar. Cuando escribís una
          respuesta acá, el asistente la usa de ahí en adelante con quien pregunte algo
          parecido — así que escribila en general, no para la persona que preguntó.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Esperando respuesta ───────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          <MessageCircleQuestion className="h-4 w-4" />
          Esperando ({pendientes.length})
        </h2>

        {pendientes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              No hay preguntas sin responder.
            </CardContent>
          </Card>
        ) : (
          pendientes.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{p.pregunta}</p>
                    {p.contexto && (
                      <p className="mt-1 text-sm text-gray-500">{p.contexto}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.veces_preguntada > 1 && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        <Repeat2 className="mr-1 h-3 w-3" />
                        {p.veces_preguntada} veces
                      </Badge>
                    )}
                    <Badge variant="info">{p.canal}</Badge>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  {cuando(p.ultima_vez)}
                  {p.telefono ? ` · ${p.telefono}` : ''}
                </p>

                {editando === p.id ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar(p.id);
                        if (e.key === 'Escape') { setEditando(null); setTexto(''); }
                      }}
                      rows={3}
                      placeholder="La respuesta, como se la dirías a cualquiera que pregunte esto. En pocas líneas: se lee en un teléfono."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400">Ctrl + Enter para guardar · Esc para cancelar</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditando(null); setTexto(''); }}>
                          Cancelar
                        </Button>
                        <Button size="sm" disabled={guardando || !texto.trim()} onClick={() => guardar(p.id)}>
                          {guardando ? 'Guardando…' : 'Guardar respuesta'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setEditando(p.id); setTexto(''); }}>
                      <Check className="mr-1 h-4 w-4" />
                      Responder
                    </Button>
                    {/* No sirve para el futuro: una consulta de una sola vez, algo
                        mal escrito, o algo que se contesta distinto en cada caso.
                        Se marca en vez de borrarse para que no vuelva mañana. */}
                    <Button variant="outline" size="sm" onClick={() => descartar(p.id)}>
                      <X className="mr-1 h-4 w-4" />
                      No sirve para el futuro
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* ── Lo que el asistente ya sabe ───────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Lo que el asistente ya sabe ({respondidas.length})
        </h2>

        {respondidas.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              Todavía no hay respuestas cargadas.
            </CardContent>
          </Card>
        ) : (
          respondidas.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-medium text-gray-900">{r.pregunta}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => { setEditando(r.id); setTexto(r.respuesta); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {editando === r.id ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar(r.id);
                        if (e.key === 'Escape') { setEditando(null); setTexto(''); }
                      }}
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditando(null); setTexto(''); }}>
                        Cancelar
                      </Button>
                      <Button size="sm" disabled={guardando || !texto.trim()} onClick={() => guardar(r.id)}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">{r.respuesta}</p>
                )}

                <p className="text-xs text-gray-400">
                  {r.respondida_por || 'alguien del equipo'}
                  {r.respondida_en ? ` · ${cuando(r.respondida_en)}` : ''}
                  {r.veces_preguntada > 1 ? ` · preguntada ${r.veces_preguntada} veces` : ''}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
