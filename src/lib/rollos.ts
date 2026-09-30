/**
 * Rollos de cartón corrugado para embalaje: precios y cotización.
 *
 * Los precios viven en la tabla rollos_precios (migración 044) y se editan
 * desde Configuración → Rollos. El bot los lee de acá: antes contestaba "no
 * tengo la certeza de si vendemos rollos" y la cotización la hacía una persona.
 *
 * Todos los precios son por rollo, sin IVA y sin envío. El mayorista, cuando
 * la medida lo tiene, se aplica al pedido ENTERO desde el umbral (igual que la
 * escalera de las cajas).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { IVA } from '@/lib/cotizacion/motor';

export interface RolloPrecio {
  id: string;
  ancho_m: number;
  largo_m: number;
  precio_unitario: number;
  precio_mayorista: number | null;
  mayorista_desde: number | null;
  activo: boolean;
  orden: number;
}

/** "1,20 x 25 m": como lo escribe la gente, con coma decimal. */
export function nombreDeRollo(r: Pick<RolloPrecio, 'ancho_m' | 'largo_m'>): string {
  const n = (x: number) => x.toLocaleString('es-AR', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${n(r.ancho_m)} x ${n(r.largo_m)} m`;
}

/** PostgREST devuelve numeric como texto; acá se normaliza una vez. */
function normalizar(fila: Record<string, unknown>): RolloPrecio {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(fila.id),
    ancho_m: Number(fila.ancho_m),
    largo_m: Number(fila.largo_m),
    precio_unitario: Number(fila.precio_unitario),
    precio_mayorista: num(fila.precio_mayorista),
    mayorista_desde: num(fila.mayorista_desde),
    activo: fila.activo !== false,
    orden: Number(fila.orden ?? 0),
  };
}

/** Los rollos, en el orden del panel. Con `soloActivos`, los que se venden. */
export async function leerRollos(soloActivos = true): Promise<RolloPrecio[]> {
  let q = createAdminClient()
    .from('rollos_precios')
    .select('*')
    .order('orden')
    .order('ancho_m', { ascending: false });
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizar);
}

/**
 * Busca la medida que pidieron entre las que se venden. Acepta el ancho en
 * metros o centímetros (1,20 / 1.2 / 120) y el largo en metros; si no dicen
 * el largo y hay una sola medida con ese ancho, es esa.
 */
export function buscarRollo(
  rollos: RolloPrecio[],
  anchoPedido: number,
  largoPedido?: number | null,
): RolloPrecio | null {
  const ancho = anchoPedido > 10 ? anchoPedido / 100 : anchoPedido;
  const mismoAncho = rollos.filter((r) => Math.abs(r.ancho_m - ancho) < 0.001);
  if (largoPedido) return mismoAncho.find((r) => Math.abs(r.largo_m - largoPedido) < 0.001) ?? null;
  return mismoAncho.length === 1 ? mismoAncho[0] : null;
}

export interface CotizacionDeRollos {
  medida: string;
  cantidad: number;
  precio_por_rollo: number;
  es_precio_mayorista: boolean;
  subtotal_sin_iva: number;
  iva: number;
  total_con_iva: number;
  /** Cuántos rollos más harían falta para el mayorista, si está cerca. */
  mayorista: { desde: number; precio: number; faltan: number } | null;
}

export function cotizarRollos(rollo: RolloPrecio, cantidad: number): CotizacionDeRollos {
  const esMayorista =
    rollo.precio_mayorista !== null && rollo.mayorista_desde !== null && cantidad >= rollo.mayorista_desde;
  const precio = esMayorista ? rollo.precio_mayorista! : rollo.precio_unitario;
  const subtotal = Math.round(precio * cantidad * 100) / 100;
  return {
    medida: nombreDeRollo(rollo),
    cantidad,
    precio_por_rollo: precio,
    es_precio_mayorista: esMayorista,
    subtotal_sin_iva: subtotal,
    iva: Math.round(subtotal * IVA * 100) / 100,
    total_con_iva: Math.round(subtotal * (1 + IVA) * 100) / 100,
    mayorista:
      !esMayorista && rollo.precio_mayorista !== null && rollo.mayorista_desde !== null
        ? { desde: rollo.mayorista_desde, precio: rollo.precio_mayorista, faltan: rollo.mayorista_desde - cantidad }
        : null,
  };
}

/** Una fila tal como llega del panel. */
export interface RolloEntrante {
  id?: string;
  ancho_m: number;
  largo_m: number;
  precio_unitario: number;
  precio_mayorista?: number | null;
  mayorista_desde?: number | null;
  activo?: boolean;
}

/**
 * Los problemas de una lista de rollos, en castellano y fila por fila. Un
 * precio mal cargado le llega al bot y de ahí al cliente.
 */
export function validarRollos(filas: RolloEntrante[]): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  const positivo = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  filas.forEach((f, i) => {
    const cual = `Fila ${i + 1}`;
    if (!positivo(f.ancho_m) || !positivo(f.largo_m)) errores.push(`${cual}: falta el ancho o el largo.`);
    if (!positivo(f.precio_unitario)) errores.push(`${cual}: el precio por rollo tiene que ser mayor a cero.`);
    const hayMayorista = f.precio_mayorista != null || f.mayorista_desde != null;
    if (hayMayorista) {
      if (!positivo(f.precio_mayorista) || !Number.isInteger(f.mayorista_desde) || (f.mayorista_desde ?? 0) < 2) {
        errores.push(`${cual}: el precio mayorista va con la cantidad desde la que se aplica (2 o más rollos), o los dos vacíos.`);
      } else if (f.precio_mayorista! >= f.precio_unitario) {
        errores.push(`${cual}: el precio mayorista tiene que ser menor al precio por rollo.`);
      }
    }
    const clave = `${f.ancho_m}x${f.largo_m}`;
    if (vistos.has(clave)) errores.push(`${cual}: la medida ${f.ancho_m} x ${f.largo_m} m está repetida.`);
    vistos.add(clave);
  });
  return errores;
}

/**
 * Deja la tabla como quedó la lista del panel: borra las medidas que se
 * sacaron, actualiza las que tienen id e inserta las nuevas. El orden es el
 * de la lista. Validar antes con validarRollos.
 */
export async function guardarRollos(filas: RolloEntrante[]): Promise<RolloPrecio[]> {
  const db = createAdminClient();
  const actuales = await leerRollos(false);
  const quedan = new Set(filas.map((f) => f.id).filter(Boolean));

  const aBorrar = actuales.filter((r) => !quedan.has(r.id)).map((r) => r.id);
  if (aBorrar.length) {
    const { error } = await db.from('rollos_precios').delete().in('id', aBorrar);
    if (error) throw error;
  }

  const ahora = new Date().toISOString();
  const filasDb = filas.map((f, i) => ({
    ...(f.id ? { id: f.id } : {}),
    ancho_m: f.ancho_m,
    largo_m: f.largo_m,
    precio_unitario: f.precio_unitario,
    precio_mayorista: f.precio_mayorista ?? null,
    mayorista_desde: f.mayorista_desde ?? null,
    activo: f.activo !== false,
    orden: i + 1,
    updated_at: ahora,
  }));
  const existentes = filasDb.filter((f) => 'id' in f);
  const nuevas = filasDb.filter((f) => !('id' in f));
  if (existentes.length) {
    const { error } = await db.from('rollos_precios').upsert(existentes);
    if (error) throw error;
  }
  if (nuevas.length) {
    const { error } = await db.from('rollos_precios').insert(nuevas);
    if (error) throw error;
  }
  return leerRollos(false);
}
