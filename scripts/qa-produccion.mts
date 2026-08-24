/**
 * Un solo lugar mueve los pedidos, y la fecha de entrega se puede tocar.
 *
 * POR QUE
 *
 * El grafo de transiciones vivía en dos archivos y /dispatch escribía el
 * estado con un update crudo, salteando el validador entero: una orden podía
 * llegar a "despachada" sin pasar por "lista" y sin que ninguna regla lo
 * mirara. Y la fecha de entrega la calculaba el cotizador al crear la orden y
 * después no la tocaba nadie — tres de las siete órdenes vivas la tenían en
 * null, así que no había con qué priorizar la fábrica.
 *
 * Esta QA defiende tres cosas:
 *   1. Que las reglas vivan en UN lugar y las respeten todos los caminos.
 *   2. Que dos personas moviendo la misma orden no se pisen en silencio.
 *   3. Que la vista de producción diga la verdad sobre qué es urgente.
 *
 * Corre contra la base viva con órdenes propias, y limpia al final.
 *
 *   npx tsx scripts/qa-produccion.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { createAdminClient } = await import('@/lib/supabase/admin');
const { puedeTransicionar, aplicarTransicion, TRANSICIONES, TransicionInvalida } =
  await import('@/lib/orders/transiciones');
const { ORDER_STATUS_FLOW } = await import('@/lib/utils/format');
const { GET: getProduccion } = await import('@/app/api/production/route');
const { PATCH: patchOrden } = await import('@/app/api/orders/[id]/route');
const { NextRequest } = await import('next/server');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();
const creadas: string[] = [];

async function crearOrden(campos: Record<string, unknown> = {}) {
  const { data: numero } = await db.rpc('generate_order_number');
  const { data } = await db.from('orders').insert({
    order_number: numero, client_id: null, status: 'confirmed',
    channel: 'manual', pricing_mode: 'manual',
    total_m2: 100, subtotal: 100000, printing_cost: 0, die_cut_cost: 0, shipping_cost: 0,
    total: 100000, deposit_amount: 50000, deposit_status: 'paid',
    balance_amount: 50000, balance_status: 'pending',
    ...campos,
  }).select('id, order_number, status').single();
  creadas.push(data!.id as string);
  return data!;
}

try {
  console.log('');
  console.log('El grafo vive en UN solo lugar');
  {
    ok('format.ts re-exporta el del motor', ORDER_STATUS_FLOW === TRANSICIONES);
    const { readFileSync } = await import('node:fs');
    const status = readFileSync('src/app/api/orders/[id]/status/route.ts', 'utf8');
    ok('el handler ya no tiene su copia del grafo',
       !/pending_deposit: \['confirmed'/.test(status));
    ok('y delega en aplicarTransicion', /aplicarTransicion\(/.test(status));
    const dispatch = readFileSync('src/app/api/orders/[id]/dispatch/route.ts', 'utf8');
    ok('dispatch ya no escribe status a mano',
       !/update\(\{\s*status: 'shipped'/.test(dispatch), 'sigue habiendo un update crudo');
  }

  console.log('');
  console.log('Las reglas, sin tocar la base');
  {
    const base = { deposit_status: 'paid' as const, quantities_confirmed: true, fuente: 'panel' as const };
    ok('confirmed → in_production se puede', puedeTransicionar('confirmed', 'in_production', base).ok);
    const salto = puedeTransicionar('pending_deposit', 'ready', base);
    ok('pending_deposit → ready NO se puede', !salto.ok);
    ok('y el error dice a dónde SÍ se puede ir',
       !salto.ok && /Confirmada|Cancelada/.test(salto.motivo), !salto.ok ? salto.motivo : '');

    const sinSenia = puedeTransicionar('pending_deposit', 'confirmed', { ...base, deposit_status: 'pending' });
    ok('confirmar sin seña paga se rechaza', !sinSenia.ok && /seña/.test(sinSenia.motivo));

    const mismo = puedeTransicionar('ready', 'ready', base);
    ok('mover al mismo estado devuelve 409, no 400',
       !mismo.ok && mismo.http === 409, !mismo.ok ? String(mismo.http) : '');

    const final = puedeTransicionar('delivered', 'shipped', base);
    ok('una orden entregada ya no se mueve', !final.ok && /ya no se mueve/.test(final.motivo));
  }

  console.log('');
  console.log('La regla del despacho vale en el despacho, no en el kanban');
  {
    // Fernando arrastra tarjetas hasta "entregada" sin pasar por confirmar
    // cantidades: dos de las órdenes vivas llegaron así. Imponerle la regla en
    // el kanban sería romperle la costumbre sin arreglar nada.
    const ctx = { deposit_status: 'paid' as const, quantities_confirmed: false };
    ok('el kanban puede despachar sin confirmar cantidades',
       puedeTransicionar('ready', 'shipped', { ...ctx, fuente: 'panel' }).ok);
    const formal = puedeTransicionar('ready', 'shipped', { ...ctx, fuente: 'dispatch' });
    ok('el despacho formal NO', !formal.ok && /cantidades/.test(formal.motivo));
  }

  console.log('');
  console.log('Aplicar de verdad: estampa el timestamp y deja historial');
  {
    const orden = await crearOrden();
    const { orden: movida, anterior } = await aplicarTransicion(db, orden.id as string, 'in_production', {
      fuente: 'panel',
    });
    ok('devuelve el estado anterior', anterior === 'confirmed', anterior);
    ok('la orden quedó en producción', movida.status === 'in_production');
    ok('con production_started_at estampado', !!movida.production_started_at);

    const { data: hist } = await db.from('communications')
      .select('subject, metadata').eq('order_id', orden.id).maybeSingle();
    ok('queda el renglón en el historial', /En Producción|Producción/i.test(hist?.subject ?? ''), hist?.subject);
    ok('con la fuente anotada',
       (hist?.metadata as { fuente?: string })?.fuente === 'panel',
       JSON.stringify(hist?.metadata));
  }

  console.log('');
  console.log('DOS PERSONAS MOVIENDO LA MISMA ORDEN: no se pisan');
  {
    // Sin el WHERE por estado, el segundo update pisaba al primero y ninguna
    // regla miraba el estado real: una orden podía saltar de confirmed a ready
    // porque dos personas apretaron a la vez.
    const orden = await crearOrden();
    const [a, b] = await Promise.allSettled([
      aplicarTransicion(db, orden.id as string, 'in_production', { fuente: 'panel' }),
      aplicarTransicion(db, orden.id as string, 'cancelled', { fuente: 'panel' }),
    ]);
    const exitos = [a, b].filter((r) => r.status === 'fulfilled').length;
    ok('solo UNO de los dos gana', exitos === 1, `ganaron ${exitos}`);
    const perdedor = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    ok('y al otro se le explica que recargue',
       perdedor?.reason instanceof TransicionInvalida && /Recargá/.test(perdedor.reason.message),
       String(perdedor?.reason?.message));
  }

  console.log('');
  console.log('La fecha de entrega se edita');
  {
    const orden = await crearOrden({ estimated_delivery: null });
    const req = new NextRequest(`http://localhost/api/orders/${orden.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ estimated_delivery: '2026-10-15' }),
    });
    const res = await patchOrden(req, { params: Promise.resolve({ id: orden.id as string }) });
    ok('el PATCH la acepta', res.status === 200, String(res.status));
    const { data } = await db.from('orders').select('estimated_delivery').eq('id', orden.id).single();
    ok('y queda guardada', String(data?.estimated_delivery).startsWith('2026-10-15'), String(data?.estimated_delivery));

    const mala = new NextRequest(`http://localhost/api/orders/${orden.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ estimated_delivery: 'el jueves' }),
    });
    const resMala = await patchOrden(mala, { params: Promise.resolve({ id: orden.id as string }) });
    ok('una fecha inventada se rechaza con 400', resMala.status === 400, String(resMala.status));

    const coord = new NextRequest(`http://localhost/api/orders/${orden.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduled_delivery_date: '2026-10-20T15:00', delivery_time_window: '15 a 17hs' }),
    });
    const resCoord = await patchOrden(coord, { params: Promise.resolve({ id: orden.id as string }) });
    ok('la coordinación de entrega también', resCoord.status === 200, String(resCoord.status));
    const { data: d2 } = await db.from('orders')
      .select('scheduled_delivery_date, delivery_time_window').eq('id', orden.id).single();
    ok('con su franja horaria en texto libre', d2?.delivery_time_window === '15 a 17hs', String(d2?.delivery_time_window));
  }

  console.log('');
  console.log('La vista de producción');
  {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const vencida = await crearOrden({ status: 'in_production', estimated_delivery: ayer });
    const sinFecha = await crearOrden({ status: 'ready', estimated_delivery: null });
    await db.from('order_items').insert({
      order_id: vencida.id, length_mm: 400, width_mm: 300, height_mm: 200,
      m2_per_box: 0.72, quantity: 1000, total_m2: 720,
    });

    const res = await getProduccion(new NextRequest('http://localhost/api/production'));
    const body = await res.json();
    ok('responde', res.status === 200);

    const filas = body.data as Array<Record<string, unknown>>;
    const laVencida = filas.find((o) => o.id === vencida.id);
    ok('marca la vencida', laVencida?.urgencia === 'vencida', String(laVencida?.urgencia));
    ok('con los días en negativo', Number(laVencida?.dias_restantes) < 0, String(laVencida?.dias_restantes));

    const laSinFecha = filas.find((o) => o.id === sinFecha.id);
    ok('distingue "sin fecha" de "vencida"', laSinFecha?.urgencia === 'sin_fecha', String(laSinFecha?.urgencia));
    ok('el resumen las cuenta', body.resumen.vencidas >= 1 && body.resumen.sin_fecha >= 1,
       JSON.stringify(body.resumen));

    const items = laVencida?.items as Array<Record<string, unknown>>;
    // 400x300x200 → ancho 200+300=500, largo 2*400+2*300+50=1450
    ok('calcula la medida de plancha', items?.[0]?.plancha_ancho_mm === 500 && items?.[0]?.plancha_largo_mm === 1450,
       JSON.stringify(items?.[0]));
    ok('y avisa si no entra en el rollo', items?.[0]?.no_entra_en_el_rollo === false);

    // Las que ya salieron no son cola de fábrica.
    const entregada = await crearOrden({ status: 'delivered' });
    const res2 = await getProduccion(new NextRequest('http://localhost/api/production'));
    const body2 = await res2.json();
    ok('una orden entregada no aparece en la cola',
       !(body2.data as Array<{ id: string }>).some((o) => o.id === entregada.id));
  }
} finally {
  if (creadas.length) {
    await db.from('order_notifications').delete().in('order_id', creadas);
    await db.from('communications').delete().in('order_id', creadas);
    await db.from('order_items').delete().in('order_id', creadas);
    await db.from('orders').delete().in('id', creadas);
  }
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true });
  console.log(`\n  (limpieza hecha: quedan ${count} órdenes, las reales)`);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
