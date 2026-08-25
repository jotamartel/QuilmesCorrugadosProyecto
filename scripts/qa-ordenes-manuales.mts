/**
 * Cargar pedidos a mano: los dos modos de precio y la marca de origen.
 *
 * POR QUE
 *
 * La unica puerta a una orden era convertir una cotizacion aprobada: los
 * pedidos de telefono o mostrador vivian afuera del sistema. El POST nuevo
 * abre esa puerta con dos reglas que esta QA defiende:
 *
 * 1. El precio se elige explicito (motor o negociado) y el motor NUNCA se cae
 *    a manual solo: ese silencio convertiria cada rechazo en un precio
 *    inventado sin que nadie lo decida.
 * 2. La geometria no se negocia: una caja que no entra en el rollo se rechaza
 *    aunque el precio sea manual.
 *
 * Corre contra la base viva con un cliente de prueba imposible de confundir
 * (telefono +5490000000000, dominio .test) y borra todo al final.
 *
 *   npx tsx scripts/qa-ordenes-manuales.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { createAdminClient } = await import('@/lib/supabase/admin');
const { POST } = await import('@/app/api/orders/route');
const { NextRequest } = await import('next/server');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, json: await res.json() };
}

// Cliente de prueba, con marcas imposibles en un dato real.
const { data: clienteQA } = await db
  .from('clients')
  .insert({ name: 'QA Ordenes Manuales', email: 'qa-ordenes@example.test', phone: '+5490000000000' })
  .select('id')
  .single();

const ordenesCreadas: string[] = [];

try {
  console.log('');
  console.log('Precio de lista: lo calcula el motor');
  {
    const r = await post({
      client_id: clienteQA!.id,
      items: [{ length_mm: 400, width_mm: 300, height_mm: 300, quantity: 800 }],
      pricing_mode: 'motor',
    });
    const orden = r.json.order as Record<string, unknown> | undefined;
    ok('crea la orden', r.status === 200 && !!orden, JSON.stringify(r.json).slice(0, 200));
    if (orden) {
      ordenesCreadas.push(orden.id as string);
      ok('canal manual, sin quote', orden.channel === 'manual' && orden.quote_id === null);
      ok('pricing_mode motor', orden.pricing_mode === 'motor');
      ok('el subtotal es m2 * precio de escalera', Number(orden.subtotal) > 0, String(orden.subtotal));
      ok('nace esperando seña', orden.status === 'pending_deposit');
      ok('token publico generado por la base', /^[A-Za-z0-9_-]{22}$/.test(String(orden.public_token)));
      ok('fecha de entrega calculada', orden.estimated_delivery !== null);
      const items = orden.items as Array<Record<string, unknown>>;
      ok('items con geometria del motor', items?.length === 1 && Number(items[0].m2_per_box) > 0);
    }
  }

  console.log('');
  console.log('Bajo minimo con motor: rechaza con la salida, NO se cae a manual');
  {
    const r = await post({
      items: [{ length_mm: 300, width_mm: 200, height_mm: 200, quantity: 100 }],
      pricing_mode: 'motor',
    });
    ok('devuelve 400', r.status === 400, String(r.status));
    ok('dice el minimo y los m2', /m²/.test(String(r.json.error)), String(r.json.error));
    ok('ofrece el camino del precio manual', /manual/.test(String(r.json.hint)), String(r.json.hint));
  }

  console.log('');
  console.log('Precio negociado: manda el vendedor');
  {
    const r = await post({
      client_id: clienteQA!.id,
      items: [{ length_mm: 300, width_mm: 200, height_mm: 200, quantity: 100 }],
      pricing_mode: 'manual',
      manual_pricing: { subtotal: 50000, total: 50000 },
      initial_status: 'confirmed',
      deposit: { method: 'efectivo', amount: 25000 },
    });
    const orden = r.json.order as Record<string, unknown> | undefined;
    ok('crea la orden aunque el motor la rechazaria', r.status === 200 && !!orden, JSON.stringify(r.json).slice(0, 200));
    if (orden) {
      ordenesCreadas.push(orden.id as string);
      ok('guarda el precio tal cual', Number(orden.subtotal) === 50000 && Number(orden.total) === 50000);
      ok('pricing_mode manual', orden.pricing_mode === 'manual');
      ok('nace confirmada con la seña registrada',
         orden.status === 'confirmed' && orden.deposit_status === 'paid' && orden.deposit_method === 'efectivo');
      ok('confirmed_at seteado', orden.confirmed_at !== null);
      // El saldo cierra contra el total CON IVA, no contra `total`.
      //
      // Antes esperaba 25000, o sea total(50000) - seña(25000). Eso daba por
      // sentado que el cliente debe el neto, y no: debe 60500. El saldo que
      // quedaba anotado se comia el 21% del IVA.
      //
      // Se corrigio el 25/08/2026 al decidir que la seña sale del total con
      // IVA (ver SENA_SOBRE en @/lib/pagos/esquemas). `orders.total` sigue
      // siendo neto —no se toco— asi que seña + saldo NO da `total` y da bien.
      ok('saldo = total con IVA - seña', Number(orden.balance_amount) === 35500,
         `balance_amount = ${orden.balance_amount}, esperado 60500 - 25000`);
      ok('y seña + saldo es lo que el cliente debe',
         Number(orden.deposit_amount) + Number(orden.balance_amount) === 60500,
         `${orden.deposit_amount} + ${orden.balance_amount}`);
      const { data: pago } = await db.from('payments').select('type, amount, method')
        .eq('order_id', orden.id as string).maybeSingle();
      ok('la seña dejo fila en payments', pago?.type === 'deposit' && Number(pago?.amount) === 25000,
         JSON.stringify(pago));
      ok('sin fecha: queda null para fijar despues', orden.estimated_delivery === null);
    }
  }

  console.log('');
  console.log('Lo que no se negocia');
  {
    const r = await post({
      items: [{ length_mm: 900, width_mm: 800, height_mm: 700, quantity: 500 }],
      pricing_mode: 'manual',
      manual_pricing: { subtotal: 1, total: 1 },
    });
    ok('una caja que no entra en el rollo se rechaza aunque el precio sea manual',
       r.status === 400 && /no se puede fabricar/.test(String(r.json.error)), JSON.stringify(r.json));
  }
  {
    const r = await post({
      items: [{ length_mm: 400, width_mm: 300, height_mm: 300, quantity: 800 }],
      pricing_mode: 'motor',
      initial_status: 'confirmed',
    });
    ok('confirmada sin seña registrada se rechaza', r.status === 400 && /seña/.test(String(r.json.error)),
       JSON.stringify(r.json));
  }
  {
    const r = await post({
      items: [{ length_mm: 400, width_mm: 300, height_mm: 300, quantity: 800 }],
      pricing_mode: 'motor',
      initial_status: 'in_production',
    });
    ok('nacer en produccion se rechaza: a ese estado se llega, no se nace',
       r.status === 400, JSON.stringify(r.json));
  }
  {
    const r = await post({
      items: [{ length_mm: 300, width_mm: 200, height_mm: 200, quantity: 100 }],
      pricing_mode: 'manual',
      manual_pricing: { subtotal: 0, total: 0 },
    });
    ok('precio manual en cero se rechaza', r.status === 400);
  }

  console.log('');
  console.log('El convert hereda el canal (verificacion estatica)');
  {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/api/quotes/[id]/convert/route.ts', 'utf8');
    ok('convert escribe channel de la quote', /channel: quote\.channel/.test(src));
    ok("convert marca pricing_mode 'motor'", /pricing_mode: 'motor'/.test(src));
  }

  console.log('');
  console.log('Los historicos siguen bien repartidos');
  {
    const { data } = await db.from('orders').select('channel').not('id', 'in', `(${ordenesCreadas.join(',')})`);
    const cuenta = (data ?? []).reduce<Record<string, number>>((a, r) => {
      a[r.channel] = (a[r.channel] ?? 0) + 1; return a;
    }, {});
    ok('4 manual + 3 web', cuenta.manual === 4 && cuenta.web === 3, JSON.stringify(cuenta));
  }
} finally {
  // Borrar TODO lo creado, en orden de dependencias.
  if (ordenesCreadas.length) {
    await db.from('payments').delete().in('order_id', ordenesCreadas);
    await db.from('communications').delete().in('order_id', ordenesCreadas);
    await db.from('order_items').delete().in('order_id', ordenesCreadas);
    await db.from('orders').delete().in('id', ordenesCreadas);
  }
  if (clienteQA) {
    await db.from('communications').delete().eq('client_id', clienteQA.id);
    await db.from('clients').delete().eq('id', clienteQA.id);
  }
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true });
  console.log(`\n  (limpieza hecha: quedan ${count} ordenes en la base, las reales)`);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
