'use client';

/**
 * La vista de piso: qué se fabrica hoy y en qué orden.
 *
 * Es la respuesta a una pregunta distinta de la que responde /ordenes. Ahí se
 * gestiona el pedido —pagos, documentos, despacho—; acá se mira la cola de la
 * máquina, ordenada por lo que está más comprometido.
 *
 * Se puede fijar la fecha de entrega desde el renglón, sin entrar al detalle:
 * un pedido sin fecha no se puede priorizar, y el momento en que alguien lo
 * nota es justo este.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingPage, LoadingSpinner } from '@/components/ui/loading';
import { AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { formatM2 } from '@/lib/utils/pricing';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/utils/format';
import type { OrderStatus } from '@/lib/types/database';

interface ItemDeProduccion {
  id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  total_m2: number;
  plancha_ancho_mm: number;
  plancha_largo_mm: number;
  no_entra_en_el_rollo: boolean;
}

interface OrdenDeProduccion {
  id: string;
  order_number: string;
  status: OrderStatus;
  estimated_delivery: string | null;
  total_m2: number;
  dias_restantes: number | null;
  urgencia: 'vencida' | 'hoy' | 'proxima' | 'normal' | 'sin_fecha';
  plancha_ancho_max_mm: number;
  lleva_impresion: boolean;
  client: { name: string; company: string | null } | null;
  items: ItemDeProduccion[];
}

interface Resumen {
  total: number;
  vencidas: number;
  sin_fecha: number;
  m2_total: number;
}

const COLOR_URGENCIA: Record<OrdenDeProduccion['urgencia'], string> = {
  vencida: 'bg-red-100 text-red-800',
  hoy: 'bg-orange-100 text-orange-800',
  proxima: 'bg-amber-100 text-amber-800',
  normal: 'bg-gray-100 text-gray-600',
  sin_fecha: 'bg-purple-100 text-purple-800',
};

function cuandoSale(o: OrdenDeProduccion): string {
  if (o.dias_restantes === null) return 'sin fecha';
  const d = o.dias_restantes;
  if (d < 0) return `vencida hace ${Math.abs(d)} ${Math.abs(d) === 1 ? 'día' : 'días'}`;
  if (d === 0) return 'entrega hoy';
  if (d === 1) return 'entrega mañana';
  return `faltan ${d} días`;
}

const fechaCorta = (f: string | null) =>
  f ? f.slice(0, 10).split('-').reverse().join('/') : '—';

export default function ProduccionPage() {
  const [ordenes, setOrdenes] = useState<OrdenDeProduccion[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [incluirPendientes, setIncluirPendientes] = useState(false);
  const [editandoFecha, setEditandoFecha] = useState<string | null>(null);
  const [fechaNueva, setFechaNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const res = await fetch(`/api/production${incluirPendientes ? '?incluir_pendientes=1' : ''}`);
      const data = await res.json();
      if (res.ok) {
        setOrdenes(data.data || []);
        setResumen(data.resumen || null);
      }
    } finally {
      setCargando(false);
    }
  }, [incluirPendientes]);

  useEffect(() => { cargar(); }, [cargar]);

  // Refresco silencioso: la pantalla puede quedar abierta toda la mañana y el
  // estado lo mueve otra persona desde el panel. Sin el spinner, que
  // parpadeando encima de una lista que alguien está leyendo es peor que no
  // refrescar.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden && !editandoFecha) cargar(true);
    }, 60_000);
    return () => clearInterval(t);
  }, [cargar, editandoFecha]);

  async function guardarFecha(id: string) {
    if (!fechaNueva) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimated_delivery: fechaNueva }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'No se pudo guardar la fecha');
        return;
      }
      setEditandoFecha(null);
      setFechaNueva('');
      await cargar(true);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Producción</h1>
          <p className="text-gray-500">Qué hay que fabricar, por fecha de entrega</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={incluirPendientes}
              onChange={(e) => setIncluirPendientes(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Incluir las que esperan seña
          </label>
          <Button variant="outline" size="sm" onClick={() => cargar()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {resumen && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span><b className="text-lg">{resumen.total}</b> pedidos en fábrica</span>
            <span><b className="text-lg">{formatM2(resumen.m2_total)}</b> m² de cartón</span>
            {resumen.vencidas > 0 && (
              <span className="text-red-700"><b className="text-lg">{resumen.vencidas}</b> vencidas</span>
            )}
            {resumen.sin_fecha > 0 && (
              <span className="text-purple-700"><b className="text-lg">{resumen.sin_fecha}</b> sin fecha</span>
            )}
          </CardContent>
        </Card>
      )}

      {ordenes.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-gray-500">
          No hay pedidos en fabricación.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {ordenes.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{o.order_number}</span>
                      <Badge className={ORDER_STATUS_COLORS[o.status]}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </Badge>
                      <Badge className={COLOR_URGENCIA[o.urgencia]}>{cuandoSale(o)}</Badge>
                      {o.lleva_impresion && (
                        <Badge className="bg-sky-100 text-sky-800">con impresión</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {o.client?.company || o.client?.name || 'Sin cliente'}
                      {o.client?.company && o.client?.name ? ` · ${o.client.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-sm">
                      <p className="text-gray-500">Entrega</p>
                      {editandoFecha === o.id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input
                            type="date"
                            value={fechaNueva}
                            onChange={(e) => setFechaNueva(e.target.value)}
                            className="text-sm"
                          />
                          <Button size="sm" onClick={() => guardarFecha(o.id)} disabled={guardando}>
                            {guardando ? <LoadingSpinner size="sm" /> : 'OK'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditandoFecha(null)}>
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoFecha(o.id);
                            setFechaNueva(o.estimated_delivery?.slice(0, 10) ?? '');
                          }}
                          className="font-medium hover:text-blue-600 hover:underline"
                        >
                          {fechaCorta(o.estimated_delivery)}
                        </button>
                      )}
                    </div>
                    <Link href={`/ordenes/${o.id}`}>
                      <Button variant="outline" size="sm"><Eye className="w-4 h-4" /></Button>
                    </Link>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-gray-500">
                        <th className="text-left font-medium pb-1">Cantidad</th>
                        <th className="text-left font-medium pb-1">Caja</th>
                        <th className="text-left font-medium pb-1">Plancha</th>
                        <th className="text-right font-medium pb-1">m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.items.map((i) => (
                        <tr key={i.id}>
                          <td className="py-0.5 tabular-nums">{i.quantity.toLocaleString('es-AR')}</td>
                          <td className="py-0.5">{i.length_mm}×{i.width_mm}×{i.height_mm}</td>
                          <td className="py-0.5">
                            <span className={i.no_entra_en_el_rollo ? 'text-red-700 font-medium' : ''}>
                              {i.plancha_ancho_mm}×{i.plancha_largo_mm} mm
                            </span>
                            {i.no_entra_en_el_rollo && (
                              <span className="inline-flex items-center gap-1 ml-2 text-xs text-red-700">
                                <AlertTriangle className="w-3 h-3" />
                                no entra en el rollo
                              </span>
                            )}
                          </td>
                          <td className="py-0.5 text-right tabular-nums">{formatM2(i.total_m2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
