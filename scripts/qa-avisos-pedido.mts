/**
 * El motor de avisos: que salga UNA vez, y que nunca salga roto.
 *
 * POR QUE
 *
 * Es la pieza que le habla al cliente. Un error acá se ve en el teléfono de
 * alguien y no se puede desenviar. Las dos promesas que esta QA defiende:
 *
 *   1. UNA sola vez. El doble disparo es real: despachar escribe el estado por
 *      su lado y el panel puede escribirlo por el otro. El UNIQUE de la base es
 *      la llave, y acá se prueba que funciona de verdad — no que el código
 *      "tiene cuidado".
 *   2. Nunca roto. Meta rechaza el envío ENTERO si una variable llega vacía,
 *      con un error que no dice cuál. Cada caso donde un dato puede faltar
 *      —fecha sin fijar, alias sin cargar, cliente sin WhatsApp— tiene que
 *      cortar ANTES de llamar, con el motivo puesto.
 *
 * Corre contra la base viva con Meta MOCKEADO: crea su propia orden, cuenta
 * cuántas veces se habría llamado a la API, y borra todo al final. No sale un
 * solo WhatsApp de verdad.
 *
 *   npx tsx scripts/qa-avisos-pedido.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { createAdminClient } = await import('@/lib/supabase/admin');
const { notificarEventoDePedido, EVENTO_POR_ESTADO, explicarResultado } =
  await import('@/lib/notificaciones-pedido');
const { setConfigValues, invalidateConfigCache } = await import('@/lib/config/system');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();

// LA CONFIGURACION REAL SE GUARDA ANTES DE TOCARLA.
//
// Esta QA prueba el caso "no hay alias cargado", y para eso lo tiene que
// vaciar. Corre contra la base de PRODUCCION: sin restaurarlo despues, la
// fabrica se queda sin datos bancarios y ni la web ni el bot los publican.
// Paso de verdad, y se descubrio recien al revisar que habia quedado abierto.
const KEYS_BANCO = [
  'payment_bank_alias', 'payment_bank_cbu',
  'payment_bank_holder', 'payment_bank_cuit', 'payment_bank_name',
];
const { data: bancoPrevio } = await db
  .from('system_config').select('key, value').in('key', KEYS_BANCO);
const configBancaria = Object.fromEntries((bancoPrevio ?? []).map((r) => [r.key, r.value]));

// ── Meta, mockeado. Se cuenta cada llamada y se guarda el último cuerpo. ─────
const fetchReal = globalThis.fetch;
let llamadas = 0;
let ultimoEnvio: Record<string, unknown> = {};
// La latencia se sube para probar la carrera: sin demora, dos llamadas
// "concurrentes" se ejecutan uma después de la otra y el bug no aparece.
let demoraMeta = 0;
globalThis.fetch = (async (url: unknown, init: { body?: string }) => {
  const u = String(url);
  if (u.includes('graph.facebook.com')) {
    llamadas++;
    ultimoEnvio = JSON.parse(init?.body || '{}');
    if (demoraMeta) await new Promise((r) => setTimeout(r, demoraMeta));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.qa' }] }), { status: 200 });
  }
  return fetchReal(url as string, init as RequestInit);
}) as unknown as typeof fetch;

// ── Datos de prueba, con marcas imposibles en un dato real ──────────────────
const { data: cliente } = await db
  .from('clients')
  .insert({
    name: 'QA Avisos', email: 'qa-avisos@example.test',
    phone: '+5490000000000', whatsapp: '5490000000000',
  })
  .select('id').single();

const { data: numero } = await db.rpc('generate_order_number');
const { data: orden } = await db
  .from('orders')
  .insert({
    order_number: numero, client_id: cliente!.id, status: 'confirmed',
    channel: 'manual', pricing_mode: 'manual',
    total_m2: 100, subtotal: 1000000, printing_cost: 0, die_cut_cost: 0, shipping_cost: 0,
    total: 1000000, deposit_amount: 500000, deposit_status: 'paid',
    balance_amount: 500000, balance_status: 'pending',
    estimated_delivery: '2026-09-05',
  })
  .select('id, order_number, public_token').single();

const ORDEN = orden!.id as string;

async function avisos() {
  const { data } = await db.from('order_notifications').select('*').eq('order_id', ORDEN);
  return data ?? [];
}
async function limpiarAvisos() {
  await db.from('order_notifications').delete().eq('order_id', ORDEN);
  await db.from('communications').delete().eq('order_id', ORDEN);
}

try {
  console.log('');
  console.log('El aviso sale, y sale bien armado');
  {
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'confirmada', actor: 'qa' });
    ok('devuelve enviada', r.estado === 'enviada', JSON.stringify(r));
    ok('llamó a Meta una vez', llamadas === 1, String(llamadas));

    const t = ultimoEnvio.template as { name?: string; components?: Array<Record<string, unknown>> };
    ok('con la plantilla correcta', t?.name === 'pedido_confirmado', t?.name);
    const cuerpo = t?.components?.find((c) => c.type === 'body');
    const vals = (cuerpo?.parameters as Array<{ text: string }>).map((p) => p.text);
    ok('el número de pedido va primero', vals[0] === orden!.order_number, vals.join(' | '));
    ok('el saldo va formateado, sin decimales', vals[1] === '500.000', vals[1]);
    ok('NINGUNA variable vacía', vals.every((v) => v.trim().length > 0), JSON.stringify(vals));

    const boton = t?.components?.find((c) => c.type === 'button');
    ok('el botón lleva el token público',
       JSON.stringify(boton?.parameters).includes(orden!.public_token as string),
       JSON.stringify(boton));

    const [fila] = await avisos();
    ok('queda registrado como enviada', fila?.resultado === 'enviada', fila?.resultado);
    ok('con el actor que lo pidió', fila?.actor === 'qa', fila?.actor);

    const { data: comu } = await db.from('communications')
      .select('channel, direction, metadata').eq('order_id', ORDEN).maybeSingle();
    ok('y en el historial de la orden como automático',
       comu?.channel === 'whatsapp' && (comu?.metadata as { automatico?: boolean })?.automatico === true,
       JSON.stringify(comu));
  }

  console.log('');
  console.log('DOS VECES EL MISMO EVENTO: una sola noticia');
  {
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'confirmada' });
    ok('devuelve ya_enviada', r.estado === 'ya_enviada', JSON.stringify(r));
    ok('NO volvió a llamar a Meta', llamadas === 0, String(llamadas));
    ok('sigue habiendo una sola fila', (await avisos()).length === 1);
  }

  console.log('');
  console.log('DOS DISPAROS A LA VEZ: sigue siendo una sola noticia');
  {
    // El bug que encontró la revisión adversarial, reproducido: la reserva se
    // escribía como 'error', y el segundo proceso la leía como "el anterior
    // falló, mando yo". Una fila en la base, DOS WhatsApp en el teléfono.
    //
    // Es el caso real de 'despachada': POST /dispatch escribe el estado por su
    // lado y el panel puede escribirlo por el otro.
    await limpiarAvisos();
    llamadas = 0;
    demoraMeta = 400;
    const [a, b] = await Promise.all([
      notificarEventoDePedido({ orderId: ORDEN, evento: 'despachada', actor: 'A' }),
      notificarEventoDePedido({ orderId: ORDEN, evento: 'despachada', actor: 'B' }),
    ]);
    demoraMeta = 0;

    ok('META FUE LLAMADO UNA SOLA VEZ', llamadas === 1,
       `fueron ${llamadas} — el cliente habría recibido ${llamadas} WhatsApp iguales`);
    ok('una sola fila', (await avisos()).length === 1);
    const estados = [a.estado, b.estado].sort();
    ok('uno envía y el otro se frena', estados[0] === 'en_curso' && estados[1] === 'enviada',
       estados.join(' + '));
    const [fila] = await avisos();
    ok('la fila queda como enviada', fila?.resultado === 'enviada', fila?.resultado);
  }

  console.log('');
  console.log('Una reserva abandonada se puede retomar');
  {
    // Si el proceso muere entre la reserva y la respuesta de Meta, la fila
    // queda en 'enviando' para siempre. Pasado el vencimiento se retoma: no
    // avisar nunca es peor que un duplicado raro.
    await limpiarAvisos();
    await db.from('order_notifications').insert({
      order_id: ORDEN, evento: 'entregada', plantilla: 'pedido_entregado',
      canal: 'whatsapp', telefono_destino: '+5490000000000', variables: {},
      resultado: 'enviando', motivo: null, actor: 'zombie',
      updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'entregada' });
    ok('la reserva vieja se retoma', r.estado === 'enviada', JSON.stringify(r));
    ok('y se manda', llamadas === 1, String(llamadas));
  }
  {
    // La fresca, no: alguien la está mandando ahora.
    await limpiarAvisos();
    await db.from('order_notifications').insert({
      order_id: ORDEN, evento: 'entregada', plantilla: 'pedido_entregado',
      canal: 'whatsapp', telefono_destino: '+5490000000000', variables: {},
      resultado: 'enviando', motivo: null, actor: 'en_vuelo',
      updated_at: new Date().toISOString(),
    });
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'entregada' });
    ok('la reserva fresca frena el envío', r.estado === 'en_curso', JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0, String(llamadas));
  }

  console.log('');
  console.log('Las fechas, en la hora de la fábrica y no la del servidor');
  {
    // Un despacho de las 22:00 del 14 en Argentina se guarda como 01:00Z del
    // 15. En Vercel (UTC) se anunciaba "despachamos el 15": un día que para el
    // operador no pasó.
    await limpiarAvisos();
    await db.from('orders')
      .update({ shipped_at: '2026-01-15T01:00:00.000Z' })
      .eq('id', ORDEN);
    llamadas = 0;
    await notificarEventoDePedido({ orderId: ORDEN, evento: 'despachada' });
    const t = ultimoEnvio.template as { components?: Array<Record<string, unknown>> };
    const vals = (t?.components?.find((c) => c.type === 'body')?.parameters as Array<{ text: string }>)
      .map((p) => p.text);
    ok('01:00Z del 15 se cuenta como el 14 en Argentina', vals[1] === '14/01/2026', vals[1]);
  }
  {
    // Y una fecha sin hora (las de entrega) no se corre un día para atrás.
    await limpiarAvisos();
    await db.from('orders').update({ estimated_delivery: '2026-01-27' }).eq('id', ORDEN);
    await notificarEventoDePedido({ orderId: ORDEN, evento: 'en_produccion' });
    const t = ultimoEnvio.template as { components?: Array<Record<string, unknown>> };
    const vals = (t?.components?.find((c) => c.type === 'body')?.parameters as Array<{ text: string }>)
      .map((p) => p.text);
    ok('la fecha de entrega sale el día que dice la orden', vals[1] === '27/01/2026', vals[1]);
    await db.from('orders').update({ estimated_delivery: '2026-09-05' }).eq('id', ORDEN);
  }

  console.log('');
  console.log('Un aviso que quedó a medias SÍ se reintenta');
  {
    // La diferencia entre "ya se enteró" y "no se enteró": lo segundo se
    // reintenta, lo primero no.
    await limpiarAvisos();
    await notificarEventoDePedido({ orderId: ORDEN, evento: 'confirmada' });
    await db.from('order_notifications')
      .update({ resultado: 'error', motivo: 'Meta rechazó el envío' })
      .eq('order_id', ORDEN).eq('evento', 'confirmada');
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'confirmada' });
    ok('vuelve a intentar', r.estado === 'enviada', JSON.stringify(r));
    ok('y llamó a Meta', llamadas === 1, String(llamadas));
    ok('sin duplicar la fila', (await avisos()).length === 1);
  }

  console.log('');
  console.log('Cuando falta un dato, se corta ANTES de llamar a Meta');
  await limpiarAvisos();
  {
    llamadas = 0;
    await setConfigValues({ payment_bank_alias: '', payment_bank_cbu: '' });
    invalidateConfigCache();
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'saldo_actualizado' });
    ok('sin alias cargado: omitida con motivo', r.estado === 'omitida' && r.motivo === 'alias_faltante',
       JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0, String(llamadas));
    ok('el mensaje para el panel dice qué hacer',
       /Configuración/.test(explicarResultado(r)), explicarResultado(r));
  }
  {
    await db.from('clients').update({ whatsapp: null }).eq('id', cliente!.id);
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'entregada' });
    ok('sin WhatsApp: omitida', r.estado === 'omitida' && r.motivo === 'sin_whatsapp', JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0);
  }
  {
    // Los números históricos traen basura: sin código de país, cortos.
    await db.from('clients').update({ whatsapp: '1112345678' }).eq('id', cliente!.id);
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'entregada' });
    ok('WhatsApp mal cargado: omitida, no error de Meta',
       r.estado === 'omitida' && r.motivo === 'whatsapp_invalido', JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0);
  }
  {
    await db.from('clients').update({ whatsapp: '5490000000000', whatsapp_optout: true }).eq('id', cliente!.id);
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'entregada' });
    ok('cliente que pidió silencio: omitida', r.estado === 'omitida' && r.motivo === 'cliente_opt_out',
       JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0);
    ok('ni siquiera deja fila: no hubo nada que registrar', (await avisos()).length === 0);
    await db.from('clients').update({ whatsapp_optout: false }).eq('id', cliente!.id);
  }

  console.log('');
  console.log('La fecha que puede faltar nunca viaja vacía');
  {
    await db.from('orders').update({ estimated_delivery: null }).eq('id', ORDEN);
    await limpiarAvisos();
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'en_produccion' });
    ok('sale igual', r.estado === 'enviada', JSON.stringify(r));
    const t = ultimoEnvio.template as { components?: Array<Record<string, unknown>> };
    const vals = (t?.components?.find((c) => c.type === 'body')?.parameters as Array<{ text: string }>)
      .map((p) => p.text);
    ok('con texto de reserva en vez de vacío', vals[1] === 'los próximos días hábiles', vals[1]);
    await db.from('orders').update({ estimated_delivery: '2026-09-05' }).eq('id', ORDEN);
  }

  console.log('');
  console.log('Sin saldo no se pide plata');
  {
    await db.from('orders').update({ balance_amount: 0 }).eq('id', ORDEN);
    await limpiarAvisos();
    llamadas = 0;
    const r = await notificarEventoDePedido({ orderId: ORDEN, evento: 'saldo_actualizado' });
    ok('omitida por sin_saldo, no "$ 0"', r.estado === 'omitida' && r.motivo === 'sin_saldo',
       JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0);

    // Centavos: redondean a "$ 0" y el mensaje quedaría diciendo que hay que
    // pagar cero, que es la consulta que el aviso venía a evitar.
    await db.from('orders').update({ balance_amount: 0.4 }).eq('id', ORDEN);
    await limpiarAvisos();
    llamadas = 0;
    const centavos = await notificarEventoDePedido({ orderId: ORDEN, evento: 'saldo_actualizado' });
    ok('un saldo de centavos tampoco se anuncia',
       centavos.estado === 'omitida' && centavos.motivo === 'sin_saldo', JSON.stringify(centavos));
    ok('y NO llamó a Meta', llamadas === 0);
    await db.from('orders').update({ balance_amount: 500000 }).eq('id', ORDEN);
  }

  console.log('');
  console.log('Qué estado avisa y cuál no');
  {
    ok('confirmed avisa', EVENTO_POR_ESTADO.confirmed === 'confirmada');
    ok('in_production avisa', EVENTO_POR_ESTADO.in_production === 'en_produccion');
    ok('shipped avisa', EVENTO_POR_ESTADO.shipped === 'despachada');
    ok('delivered avisa', EVENTO_POR_ESTADO.delivered === 'entregada');
    ok('cancelled avisa', EVENTO_POR_ESTADO.cancelled === 'cancelada');
    // El aviso útil de "listo" es el del saldo, que sale al confirmar
    // cantidades con el número final. Dos WhatsApp seguidos casi iguales es
    // la forma de que el cliente silencie la conversación.
    ok('ready NO avisa: lo cubre el aviso del saldo', EVENTO_POR_ESTADO.ready === undefined);
    ok('pending_deposit NO avisa', EVENTO_POR_ESTADO.pending_deposit === undefined);
  }

  console.log('');
  console.log('Una orden que no existe no rompe nada');
  {
    llamadas = 0;
    const r = await notificarEventoDePedido({
      orderId: '00000000-0000-4000-8000-000000000000', evento: 'entregada',
    });
    ok('devuelve error, no explota', r.estado === 'error', JSON.stringify(r));
    ok('y NO llamó a Meta', llamadas === 0);
  }
} finally {
  globalThis.fetch = fetchReal;

  // Primero la configuracion: es lo unico de acá que, si no se repone, deja
  // la fabrica sin poder cobrar.
  await setConfigValues(configBancaria);
  invalidateConfigCache();
  const { data: verif } = await db
    .from('system_config').select('key, value').in('key', KEYS_BANCO);
  const perdidas = (verif ?? []).filter(
    (r) => (configBancaria[r.key] ?? '') !== (r.value ?? ''),
  );
  console.log(
    perdidas.length
      ? `\n  ATENCION: no se pudo restaurar ${perdidas.map((p) => p.key).join(', ')}`
      : '\n  (configuracion bancaria restaurada)',
  );

  await db.from('order_notifications').delete().eq('order_id', ORDEN);
  await db.from('communications').delete().eq('order_id', ORDEN);
  await db.from('orders').delete().eq('id', ORDEN);
  await db.from('communications').delete().eq('client_id', cliente!.id);
  await db.from('clients').delete().eq('id', cliente!.id);
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true });
  console.log(`\n  (limpieza hecha: quedan ${count} órdenes, las reales)`);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
