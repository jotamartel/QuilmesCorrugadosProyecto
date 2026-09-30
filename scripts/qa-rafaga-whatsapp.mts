/**
 * Dos mensajes seguidos, una sola respuesta.
 *
 * POR QUE
 *
 * En el historial de septiembre de 2026 el bot contestó dos veces en seis
 * conversaciones: la persona mandaba "Hola" y "cómo va" en el mismo segundo, o
 * las medidas y la cantidad por separado, Meta los entregaba en POSTs distintos
 * y cada uno corría el agente por su cuenta. Ver ESPERA_POR_RAFAGA_MS en el
 * webhook.
 *
 * Corre el webhook EN PROCESO, con un teléfono no asignable, sin red hacia
 * Meta (el envío falla en silencio, lo que cuenta es lo que queda guardado).
 * Llama al modelo de verdad. Borra lo que deja.
 *
 *   npx tsx scripts/qa-rafaga-whatsapp.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}
process.env.META_WA_APP_SECRET = 'secreto-inventado-para-probar-la-rafaga';
process.env.WHATSAPP_PROVEEDOR = 'meta';
process.env.META_WA_TOKEN = '';
process.env.META_WA_PHONE_NUMBER_ID = '';

const { POST } = await import('@/app/api/whatsapp/webhook/route');
const { createAdminClient } = await import('@/lib/supabase/admin');
const { NextRequest } = await import('next/server');

const db = createAdminClient();
const TELEFONO = '5491100000001'; // no asignable
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  if (c) console.log(`  ok   ${t}`);
  else { fallos++; console.log(`  FALLA ${t}${d ? `\n        ${d}` : ''}`); }
};

function postDeMeta(texto: string) {
  const cuerpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '0', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '5491133411781', phone_number_id: '1' },
      contacts: [{ profile: { name: 'Cliente simulado' }, wa_id: TELEFONO }],
      messages: [{ from: TELEFONO, id: `wamid.RAFAGA.${crypto.randomUUID()}`,
        timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }],
    } }] }],
  });
  const firma = 'sha256=' + crypto.createHmac('sha256', process.env.META_WA_APP_SECRET!).update(cuerpo).digest('hex');
  return POST(new NextRequest('https://www.quilmescorrugados.com.ar/api/whatsapp/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma }, body: cuerpo,
  }));
}

const salientes = async () =>
  (await db.from('communications').select('content').eq('metadata->>phone', `+${TELEFONO}`)
    .eq('direction', 'outbound').order('created_at')).data ?? [];

async function limpiar() {
  for (const [tabla, columna, valor] of [
    ['communications', 'metadata->>phone', `+${TELEFONO}`],
    ['whatsapp_conversations', 'phone_number', `+${TELEFONO}`],
    ['whatsapp_mensajes_procesados', 'telefono', `+${TELEFONO}`],
    ['contact_profiles', 'phone_number', `+${TELEFONO}`],
    ['public_quotes', 'requester_phone', `+${TELEFONO}`],
  ] as const) {
    await db.from(tabla).delete().eq(columna, valor);
  }
}

try {
  await limpiar();

  console.log('\nSaludo en dos mensajes, con un segundo de diferencia');
  {
    const a = postDeMeta('Hola');
    await new Promise((r) => setTimeout(r, 1000));
    const b = postDeMeta('como va?');
    const [ra, rb] = await Promise.all([a, b]);
    ok('los dos POST devuelven 200', ra.status === 200 && rb.status === 200);
    const s = await salientes();
    ok('sale UNA sola respuesta', s.length === 1, `salieron ${s.length}: ${s.map((x) => x.content).join(' || ').slice(0, 300)}`);
  }

  await limpiar();

  console.log('\nMedidas y cantidad en mensajes separados');
  {
    const a = postDeMeta('Hola, necesito cajas de 400x300x300');
    await new Promise((r) => setTimeout(r, 1500));
    const b = postDeMeta('1500 unidades, lisas');
    await Promise.all([a, b]);
    const s = await salientes();
    ok('sale UNA sola respuesta', s.length === 1, `salieron ${s.length}`);
    ok('y trae el precio de las 1.500', /1\.579\.050|1\.305\.000/.test(String(s.at(-1)?.content)),
      String(s.at(-1)?.content).slice(0, 300));
  }

  await limpiar();

  console.log('\nUn mensaje solo, sin ráfaga, se contesta igual');
  {
    await postDeMeta('Hola, cotizame 1500 cajas de 400x300x300 lisas');
    const s = await salientes();
    ok('sale la respuesta', s.length === 1, `salieron ${s.length}`);
  }
} finally {
  await limpiar();
}

console.log(fallos ? `\n${fallos} fallas\n` : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
