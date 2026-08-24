/**
 * El único dueño de cómo se mueve un pedido entre estados.
 *
 * POR QUE EXISTE
 *
 * El grafo de transiciones vivía en DOS lugares: ORDER_STATUS_FLOW en
 * format.ts y una copia inline dentro del handler de /status, que era la que
 * armaba el mensaje de error. Dos listas iguales que nadie garantizaba que
 * siguieran iguales: el día que alguien agregara una transición en una, el
 * error le mentiría al operador nombrando estados que ya no corresponden.
 *
 * Y peor: /dispatch escribía status='shipped' con un update crudo, salteando
 * el validador entero. Un pedido podía llegar a "despachado" sin haber pasado
 * por "listo", y sin que ninguna regla lo mirara.
 *
 * Acá vive el grafo, las reglas que lo acompañan, y la única función que
 * mueve un pedido. Cualquier otro lugar que quiera mover una orden llama a
 * aplicarTransicion; el que escriba `status:` a mano se está salteando esto.
 *
 * LAS REGLAS NO SON TODAS IGUALES DE DURAS, Y ESO ES DELIBERADO
 *
 * "Confirmar exige seña paga" vale siempre: es la definición de confirmado.
 * "Despachar exige cantidades confirmadas" vale solo en el despacho formal
 * —el que emite factura y remito— y NO en el kanban, porque hoy Fernando
 * arrastra tarjetas hasta "entregada" sin pasar por ahí. Romperle esa
 * costumbre con un 400 no es una mejora del sistema, es una molestia nueva.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderStatus, PaymentStatus } from '@/lib/types/database';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';

/** De cada estado, a dónde se puede ir. */
export const TRANSICIONES: Record<OrderStatus, OrderStatus[]> = {
  pending_deposit: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/** El timestamp que estampa cada estado al alcanzarse. */
export const TIMESTAMP_DE: Partial<Record<OrderStatus, string>> = {
  confirmed: 'confirmed_at',
  in_production: 'production_started_at',
  ready: 'ready_at',
  shipped: 'shipped_at',
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
};

/** De dónde viene el movimiento. Cambia qué reglas se aplican. */
export type FuenteDelCambio = 'panel' | 'dispatch' | 'sistema';

export interface ContextoDeTransicion {
  deposit_status: PaymentStatus;
  quantities_confirmed: boolean;
  fuente: FuenteDelCambio;
}

/**
 * Union discriminada a propósito: cada motivo nuevo es un caso que el
 * compilador obliga a contemplar donde se lea el resultado.
 */
export type Veredicto =
  | { ok: true }
  | { ok: false; motivo: string; http: 400 | 409 };

export function puedeTransicionar(
  actual: OrderStatus,
  nuevo: OrderStatus,
  ctx: ContextoDeTransicion,
): Veredicto {
  if (actual === nuevo) {
    return { ok: false, motivo: `La orden ya está en "${ORDER_STATUS_LABELS[nuevo]}"`, http: 409 };
  }

  if (!TRANSICIONES[actual].includes(nuevo)) {
    const posibles = TRANSICIONES[actual].map((s) => ORDER_STATUS_LABELS[s]);
    return {
      ok: false,
      motivo: posibles.length
        ? `No se puede pasar de "${ORDER_STATUS_LABELS[actual]}" a "${ORDER_STATUS_LABELS[nuevo]}". ` +
          `Desde acá solo se puede ir a: ${posibles.join(' o ')}.`
        : `Una orden "${ORDER_STATUS_LABELS[actual]}" ya no se mueve.`,
      http: 400,
    };
  }

  // Confirmado SIGNIFICA seña cobrada: sin eso, la palabra no quiere decir nada.
  if (nuevo === 'confirmed' && ctx.deposit_status !== 'paid') {
    return { ok: false, motivo: 'No se puede confirmar una orden sin el pago de la seña', http: 400 };
  }

  // Solo en el despacho formal. Ver el comentario de arriba: el kanban no lo
  // exige a propósito.
  if (nuevo === 'shipped' && ctx.fuente === 'dispatch' && !ctx.quantities_confirmed) {
    return {
      ok: false,
      motivo: 'Antes de despachar hay que confirmar las cantidades entregadas',
      http: 400,
    };
  }

  return { ok: true };
}

export class TransicionInvalida extends Error {
  constructor(motivo: string, readonly http: 400 | 409) {
    super(motivo);
    this.name = 'TransicionInvalida';
  }
}

/**
 * Mueve un pedido de estado. Es la única forma legítima de hacerlo.
 *
 * Valida, estampa el timestamp que corresponde y deja el renglón en el
 * historial. Lo que NO hace es avisarle al cliente: eso lo decide quien llama,
 * porque depende de si el operador tildó el casillero, y meterlo acá adentro
 * obligaría a que todo movimiento —incluidos los automáticos— tuviera que
 * decidirlo.
 */
export async function aplicarTransicion(
  db: SupabaseClient,
  orderId: string,
  nuevo: OrderStatus,
  opciones: { fuente: FuenteDelCambio; notas?: string },
): Promise<{ orden: Record<string, unknown>; anterior: OrderStatus }> {
  const { data: orden, error } = await db
    .from('orders')
    .select('id, order_number, status, client_id, deposit_status, quantities_confirmed')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !orden) throw new TransicionInvalida('Orden no encontrada', 400);

  const actual = orden.status as OrderStatus;
  const veredicto = puedeTransicionar(actual, nuevo, {
    deposit_status: orden.deposit_status as PaymentStatus,
    quantities_confirmed: !!orden.quantities_confirmed,
    fuente: opciones.fuente,
  });
  if (!veredicto.ok) throw new TransicionInvalida(veredicto.motivo, veredicto.http);

  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { status: nuevo };
  const columna = TIMESTAMP_DE[nuevo];
  if (columna) cambios[columna] = ahora;
  if (nuevo === 'cancelled') cambios.cancellation_reason = opciones.notas || null;

  // El WHERE incluye el estado que se leyó: si otro proceso movió la orden en
  // el medio, este update no encuentra fila y falla en vez de pisar. Sin eso,
  // dos operadores moviendo el mismo pedido a la vez dejan el último gana sin
  // que ninguna regla mire el estado real.
  const { data: actualizada, error: errorUpdate } = await db
    .from('orders')
    .update(cambios)
    .eq('id', orderId)
    .eq('status', actual)
    .select('*, client:clients(id, name, company, whatsapp, whatsapp_optout), quote:quotes(id, quote_number)')
    .maybeSingle();

  if (errorUpdate) throw errorUpdate;
  if (!actualizada) {
    throw new TransicionInvalida(
      'Alguien movió esta orden mientras la estabas cambiando. Recargá y volvé a intentar.',
      409,
    );
  }

  const { error: errorHistorial } = await db.from('communications').insert({
    client_id: orden.client_id,
    order_id: orden.id,
    channel: 'manual',
    direction: 'outbound',
    subject: `Estado actualizado a ${ORDER_STATUS_LABELS[nuevo]}`,
    content:
      opciones.notas ||
      `Orden ${orden.order_number} pasó a ${ORDER_STATUS_LABELS[nuevo]}`,
    metadata: {
      order_number: orden.order_number,
      previous_status: actual,
      new_status: nuevo,
      fuente: opciones.fuente,
    },
  });

  // El estado ya cambió: que el renglón del historial no haya entrado no
  // justifica deshacerlo ni mentirle al que llamó.
  if (errorHistorial) {
    console.error('[transiciones] no se pudo registrar en el historial:', errorHistorial.message);
  }

  return { orden: actualizada, anterior: actual };
}
