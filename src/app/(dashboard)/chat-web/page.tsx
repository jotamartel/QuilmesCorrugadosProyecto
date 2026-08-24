'use client';

/**
 * Lo que se habla en el chat del sitio.
 *
 * PANTALLA APARTE DE WHATSAPP, A PROPOSITO
 *
 * En WhatsApp la bandeja es una lista de pendientes: cada conversación se
 * puede tomar y contestar. Acá no — el visitante es anónimo y cuando cierra la
 * pestaña no hay a quién escribirle. Meterlas en la misma pantalla llenaría la
 * bandeja de atención de cosas que no se pueden atender, y dejaría de servir
 * para lo que sirve.
 *
 * Entonces esto es otra cosa: un registro para leer. Lo que sí acciona son las
 * dos marcas —una pregunta que el asistente no supo, alguien que pidió hablar
 * con una persona—, porque ahí sí hay algo para hacer: escribir la respuesta
 * en la base de conocimiento para que la próxima vez la sepa.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingPage } from '@/components/ui/loading';
import { MessageSquare, RefreshCw, HelpCircle, UserRound, AtSign } from 'lucide-react';

interface Conversacion {
  id: string;
  sesion: string;
  pagina_inicial: string | null;
  cantidad_mensajes: number;
  contacto: string | null;
  hubo_pregunta_sin_respuesta: boolean;
  pidio_humano: boolean;
  creada_en: string;
  ultima_en: string;
}

interface Mensaje {
  id: string;
  rol: 'visitante' | 'asistente';
  contenido: string;
  pagina: string | null;
  creado_en: string;
}

const cuandoFue = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)}h`;
  const dias = Math.round(min / 1440);
  return dias <= 7 ? `hace ${dias}d` : new Date(iso).toLocaleDateString('es-AR');
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

export default function ChatWebPage() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [resumen, setResumen] = useState<Record<string, number> | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargando, setCargando] = useState(true);
  const [soloConAlgoQueHacer, setSoloConAlgoQueHacer] = useState(false);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const res = await fetch('/api/chat-web');
      const data = await res.json();
      if (res.ok) {
        setConversaciones(data.data || []);
        setResumen(data.resumen || null);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Refresco silencioso, sin spinner: la pantalla se deja abierta y parpadear
  // encima de una conversación que alguien está leyendo es peor que esperar.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) cargar(true); }, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!elegida) { setMensajes([]); return; }
    fetch(`/api/chat-web?sesion=${encodeURIComponent(elegida)}`)
      .then((r) => r.json())
      .then((d) => setMensajes(d.mensajes || []))
      .catch(() => setMensajes([]));
  }, [elegida]);

  if (cargando) return <LoadingPage />;

  const visibles = soloConAlgoQueHacer
    ? conversaciones.filter((c) => c.hubo_pregunta_sin_respuesta || c.pidio_humano)
    : conversaciones;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chat del sitio</h1>
          <p className="text-gray-500">Lo que consultan desde la web. Solo lectura: son visitantes anónimos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => cargar()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-2xl font-bold">{resumen.total}</p>
            <p className="text-sm text-gray-500">conversaciones</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-700">{resumen.sin_respuesta}</p>
            <p className="text-sm text-gray-500">con algo que no supo</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-700">{resumen.pidieron_humano}</p>
            <p className="text-sm text-gray-500">pidieron una persona</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-2xl font-bold text-green-700">{resumen.con_contacto}</p>
            <p className="text-sm text-gray-500">dejaron un contacto</p>
          </CardContent></Card>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={soloConAlgoQueHacer}
          onChange={(e) => setSoloConAlgoQueHacer(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Solo las que dejaron algo pendiente
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="p-0 divide-y max-h-[36rem] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="p-8 text-center text-gray-500 text-sm">
                {conversaciones.length === 0
                  ? 'Todavía no hay conversaciones del sitio.'
                  : 'Ninguna dejó algo pendiente.'}
              </p>
            ) : (
              visibles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setElegida(c.sesion)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    elegida === c.sesion ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {c.pagina_inicial || 'sitio'}
                      </p>
                      <p className="text-xs text-gray-500">{c.cantidad_mensajes} mensajes</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{cuandoFue(c.ultima_en)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.hubo_pregunta_sin_respuesta && (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">
                        <HelpCircle className="w-3 h-3 mr-1" />no supo
                      </Badge>
                    )}
                    {c.pidio_humano && (
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        <UserRound className="w-3 h-3 mr-1" />pidió una persona
                      </Badge>
                    )}
                    {c.contacto && (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        <AtSign className="w-3 h-3 mr-1" />{c.contacto}
                      </Badge>
                    )}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {!elegida ? (
              <div className="p-16 text-center text-gray-500">
                <MessageSquare className="w-10 h-10 mx-auto text-gray-300" />
                <p className="mt-3">Elegí una conversación para leerla</p>
              </div>
            ) : (
              <>
                <div className="max-h-[32rem] overflow-y-auto p-4 space-y-3">
                  {mensajes.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.rol === 'visitante' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                          m.rol === 'visitante'
                            ? 'bg-gray-100 text-gray-900'
                            : 'bg-green-600 text-white'
                        }`}
                      >
                        {m.contenido}
                        <span
                          className={`block text-[11px] mt-1 ${
                            m.rol === 'visitante' ? 'text-gray-500' : 'text-green-100'
                          }`}
                        >
                          {hora(m.creado_en)}
                          {m.pagina ? ` · ${m.pagina}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Donde en WhatsApp va el campo para responder, acá va la
                    explicación de por qué no lo hay. Sin esto, alguien busca
                    el botón de contestar y cree que se rompió. */}
                <div className="border-t bg-gray-50 p-4 text-sm text-gray-600">
                  {conversaciones.find((c) => c.sesion === elegida)?.contacto ? (
                    <>
                      Esta persona dejó un contacto:{' '}
                      <strong>{conversaciones.find((c) => c.sesion === elegida)?.contacto}</strong>. Es la
                      única vía para responderle — el chat del sitio no permite escribirle de vuelta.
                    </>
                  ) : (
                    <>
                      Acá no se puede responder: el chat del sitio es anónimo y la conversación
                      termina cuando la persona cierra la pestaña. Si preguntó algo que el asistente
                      no supo, escribí la respuesta en <strong>Sin responder</strong> y la próxima vez
                      la va a contestar solo.
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
