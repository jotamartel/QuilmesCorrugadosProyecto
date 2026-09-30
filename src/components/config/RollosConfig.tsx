'use client';

import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading';

/**
 * Precios de los rollos de cartón corrugado, editables desde el panel.
 *
 * Es lo que lee el bot para cotizar rollos (ver src/lib/rollos.ts). Precios
 * por rollo, sin IVA y sin envío.
 */

interface Fila {
  id?: string;
  ancho_m: string;
  largo_m: string;
  precio_unitario: string;
  precio_mayorista: string;
  mayorista_desde: string;
  activo: boolean;
}

const vacia = (): Fila => ({
  ancho_m: '', largo_m: '', precio_unitario: '', precio_mayorista: '', mayorista_desde: '', activo: true,
});

const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
// Acepta coma decimal: "1,20" es como lo escribe cualquiera.
const aNumero = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')));
const aNumeroMedida = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function RollosConfig() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/config/rollos');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron leer los precios');
      setFilas(
        (data.rollos as Array<Record<string, number | string | boolean | null>>).map((r) => ({
          id: String(r.id),
          ancho_m: aTexto(r.ancho_m as number).replace('.', ','),
          largo_m: aTexto(r.largo_m as number).replace('.', ','),
          precio_unitario: aTexto(r.precio_unitario as number),
          precio_mayorista: aTexto(r.precio_mayorista as number | null),
          mayorista_desde: aTexto(r.mayorista_desde as number | null),
          activo: r.activo !== false,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const cambiar = (i: number, campo: keyof Fila, valor: string | boolean) => {
    setGuardado(false);
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/config/rollos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rollos: filas.map((f) => ({
            ...(f.id ? { id: f.id } : {}),
            ancho_m: aNumeroMedida(f.ancho_m),
            largo_m: aNumeroMedida(f.largo_m),
            precio_unitario: aNumero(f.precio_unitario),
            precio_mayorista: aNumero(f.precio_mayorista),
            mayorista_desde: aNumero(f.mayorista_desde),
            activo: f.activo,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      setGuardado(true);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const celda = 'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rollos de cartón corrugado</CardTitle>
        <CardDescription>
          Precio por rollo, sin IVA y sin envío. Si una medida tiene precio mayorista, se aplica al
          pedido entero desde la cantidad que indiques. El asistente de WhatsApp y del sitio cotiza
          rollos con estos precios; una medida inactiva no la ofrece.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cargando ? (
          <div className="py-8 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2 pr-2 font-medium">Ancho (m)</th>
                  <th className="pb-2 pr-2 font-medium">Largo (m)</th>
                  <th className="pb-2 pr-2 font-medium">Precio por rollo ($)</th>
                  <th className="pb-2 pr-2 font-medium">Precio mayorista ($)</th>
                  <th className="pb-2 pr-2 font-medium">Mayorista desde (rollos)</th>
                  <th className="pb-2 pr-2 font-medium">Activo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.id ?? `nueva-${i}`} className="align-top">
                    <td className="py-1 pr-2 w-24"><input className={celda} value={f.ancho_m} inputMode="decimal" placeholder="1,20" onChange={(e) => cambiar(i, 'ancho_m', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-24"><input className={celda} value={f.largo_m} inputMode="decimal" placeholder="25" onChange={(e) => cambiar(i, 'largo_m', e.target.value)} /></td>
                    <td className="py-1 pr-2"><input className={celda} value={f.precio_unitario} inputMode="numeric" placeholder="15750" onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)} /></td>
                    <td className="py-1 pr-2"><input className={celda} value={f.precio_mayorista} inputMode="numeric" placeholder="Opcional" onChange={(e) => cambiar(i, 'precio_mayorista', e.target.value)} /></td>
                    <td className="py-1 pr-2 w-32"><input className={celda} value={f.mayorista_desde} inputMode="numeric" placeholder="Opcional" onChange={(e) => cambiar(i, 'mayorista_desde', e.target.value)} /></td>
                    <td className="py-1 pr-2 text-center"><input type="checkbox" className="mt-2 h-4 w-4" checked={f.activo} onChange={(e) => cambiar(i, 'activo', e.target.checked)} /></td>
                    <td className="py-1">
                      <button type="button" title="Quitar esta medida" onClick={() => { setGuardado(false); setFilas((p) => p.filter((_, j) => j !== i)); }}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setFilas((p) => [...p, vacia()])}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
              <Plus className="w-4 h-4" /> Agregar medida
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {guardado && !error && <p className="mt-3 text-sm text-green-700">Precios de rollos guardados.</p>}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={guardar} disabled={guardando || cargando}>
          {guardando ? <LoadingSpinner size="sm" /> : (<><Save className="w-4 h-4 mr-2" />Guardar rollos</>)}
        </Button>
      </CardFooter>
    </Card>
  );
}
