/**
 * Un mensaje de Meta de verdad, sin tener un número de Meta.
 *
 * POR QUÉ EXISTE
 *
 * Todo el camino de Meta está escrito contra la documentación y probado contra
 * cuerpos que armé yo. Eso deja un hueco: nunca pasó por el webhook completo un
 * POST con la forma que manda Meta Y una firma calculada con la clave real de la
 * app. La firma es justamente lo que ahora BLOQUEA, así que si algo ahí no
 * cierra, el canal no contesta y el error aparece recién con un cliente adelante.
 *
 * Esto arma el POST tal como lo manda Meta, lo firma con META_WA_APP_SECRET y lo
 * mete por el handler de verdad. No hace falta el número de prueba de Meta, que
 * no lo dan hasta verificar el negocio: la clave de la app está disponible desde
 * el minuto cero.
 *
 * Corre EN PROCESO, sin servidor y sin red hacia Meta. Toca la base real —crea
 * la conversación y la marca de idempotencia— y borra lo que deja.
 *
 *   npx tsx scripts/simular-mensaje-meta.mts
 *
 * Si todavía no cargaste META_WA_APP_SECRET, se puede probar la mecánica con uno
 * inventado:
 *   npx tsx scripts/simular-mensaje-meta.mts --secreto-de-prueba
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';

delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const inventado = process.argv.includes('--secreto-de-prueba');
if (inventado) process.env.META_WA_APP_SECRET = 'secreto-inventado-para-probar-la-mecanica';

const SECRETO = process.env.META_WA_APP_SECRET;
if (!SECRETO) {
  console.log('\nFalta META_WA_APP_SECRET.');
  console.log('Sale de developers.facebook.com → tu app → Configuración de la app → Básica.');
  console.log('Para probar solo la mecánica: npx tsx scripts/simular-mensaje-meta.mts --secreto-de-prueba\n');
  process.exit(1);
}

// El transporte se elige al cargar el módulo, así que esto va antes del import.
process.env.WHATSAPP_PROVEEDOR = 'meta';
process.env.META_WA_TOKEN = process.env.META_WA_TOKEN || '';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '';

const { POST } = await import('@/app/api/whatsapp/webhook/route');
const { createAdminClient } = await import('@/lib/supabase/admin');
const { NextRequest } = await import('next/server');

const db = createAdminClient();
const TELEFONO = '5491100000000';       // no asignable: 11 0000-0000
const ID_MENSAJE = `wamid.SIMULADO.${Date.now()}`;
let fallos = 0;

function ok(t: string, c: boolean, d = '') {
  if (c) console.log(`  ✓ ${t}`);
  else { fallos++; console.log(`  ✗ ${t}${d ? `\n      ${d}` : ''}`); }
}

/** El cuerpo tal como lo manda Meta. */
function cuerpoDeMeta(texto: string, id: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '000000000000000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5491133411781', phone_number_id: '111111111111111' },
          contacts: [{ profile: { name: 'Cliente simulado' }, wa_id: TELEFONO }],
          messages: [{
            from: TELEFONO,
            id,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: texto },
          }],
        },
      }],
    }],
  });
}

function pedido(cuerpo: string, firma: string | null): InstanceType<typeof NextRequest> {
  const cabeceras: Record<string, string> = { 'content-type': 'application/json' };
  if (firma) cabeceras['x-hub-signature-256'] = firma;
  return new NextRequest('https://www.quilmescorrugados.com.ar/api/whatsapp/webhook', {
    method: 'POST',
    headers: cabeceras,
    body: cuerpo,
  });
}

const firmar = (cuerpo: string, conQue = SECRETO!) =>
  'sha256=' + crypto.createHmac('sha256', conQue).update(cuerpo, 'utf8').digest('hex');

try {
  console.log('');
  console.log(inventado
    ? 'Probando la mecánica con un secreto inventado'
    : 'Probando con META_WA_APP_SECRET de verdad');

  // ── 1. Un mensaje bien firmado entra ────────────────────────────────────
  console.log('');
  console.log('Un mensaje firmado como lo firma Meta');
  const cuerpo = cuerpoDeMeta('hola, necesito 1500 cajas de 400x300x300', ID_MENSAJE);
  const r1 = await POST(pedido(cuerpo, firmar(cuerpo)));
  ok('el webhook lo acepta', r1.status === 200, `devolvió ${r1.status}`);

  const { data: entrantes } = await db
    .from('communications')
    .select('content, direction')
    .eq('metadata->>phone', `+${TELEFONO}`)
    .eq('direction', 'inbound');
  ok('queda guardado el mensaje del cliente', (entrantes?.length ?? 0) > 0,
     `encontrados: ${entrantes?.length ?? 0}`);

  const { data: salientes } = await db
    .from('communications')
    .select('content')
    .eq('metadata->>phone', `+${TELEFONO}`)
    .eq('direction', 'outbound');
  ok('el asistente redactó una respuesta', (salientes?.length ?? 0) > 0);
  if (salientes?.length) {
    console.log(`      "${String(salientes[0].content).replace(/\n/g, ' ').slice(0, 150)}"`);
    ok('y la respuesta trae el precio', /1\.305\.000|1\.579\.050/.test(String(salientes[0].content)),
       'no aparece el subtotal ni el total esperados');
  }

  const { data: marca } = await db
    .from('whatsapp_mensajes_procesados')
    .select('id, proveedor, completado_en')
    .eq('id', ID_MENSAJE)
    .maybeSingle();
  ok('queda la marca de idempotencia', !!marca);
  ok('y anotada como de meta', marca?.proveedor === 'meta', `proveedor: ${marca?.proveedor}`);
  ok('y marcada como terminada', !!marca?.completado_en);

  // ── 2. El mismo mensaje otra vez no se reprocesa ─────────────────────────
  console.log('');
  console.log('El reintento del mismo mensaje');
  const antes = (salientes?.length ?? 0);
  const r2 = await POST(pedido(cuerpo, firmar(cuerpo)));
  ok('también contesta 200', r2.status === 200);

  const { data: despues } = await db
    .from('communications')
    .select('id')
    .eq('metadata->>phone', `+${TELEFONO}`)
    .eq('direction', 'outbound');
  ok('NO le contesta al cliente dos veces', (despues?.length ?? 0) === antes,
     `antes ${antes}, después ${despues?.length ?? 0}`);

  // ── 3. Una firma que no cierra se rechaza ────────────────────────────────
  console.log('');
  console.log('Una firma que no cierra');
  const otroCuerpo = cuerpoDeMeta('mensaje falsificado', `${ID_MENSAJE}.falso`);
  const r3 = await POST(pedido(otroCuerpo, firmar(otroCuerpo, 'otro-secreto-cualquiera')));
  ok('se rechaza con 403', r3.status === 403, `devolvió ${r3.status}`);

  const { data: coló } = await db
    .from('communications')
    .select('id')
    .eq('metadata->>phone', `+${TELEFONO}`)
    .ilike('content', '%falsificado%');
  ok('y no deja rastro', (coló?.length ?? 0) === 0);

  // ── 4. Sin firma tampoco entra ───────────────────────────────────────────
  console.log('');
  console.log('Sin firma');
  const sinFirma = cuerpoDeMeta('sin cabecera', `${ID_MENSAJE}.sinfirma`);
  const r4 = await POST(pedido(sinFirma, null));
  ok('se rechaza con 403', r4.status === 403,
     `devolvió ${r4.status} — con la clave puesta, el que no firma no es Meta`);

  // ── 5. Un aviso de estado no es un mensaje ───────────────────────────────
  console.log('');
  console.log('Un aviso de "entregado", que llega por el mismo webhook');
  const estado = JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: ID_MENSAJE, status: 'delivered' }] } }] }],
  });
  const r5 = await POST(pedido(estado, firmar(estado)));
  ok('se da por recibido sin hacer nada', r5.status === 200);
} finally {
  console.log('');
  const borrados: string[] = [];
  for (const [tabla, columna, valor] of [
    ['communications', 'metadata->>phone', `+${TELEFONO}`],
    ['whatsapp_conversations', 'phone_number', `+${TELEFONO}`],
    ['whatsapp_mensajes_procesados', 'telefono', `+${TELEFONO}`],
    ['contact_profiles', 'phone_number', `+${TELEFONO}`],
  ] as const) {
    const { data } = await db.from(tabla).delete().eq(columna, valor).select('id');
    if (data?.length) borrados.push(`${tabla}: ${data.length}`);
  }
  console.log(borrados.length ? `  (borrado — ${borrados.join(', ')})` : '  (nada que borrar)');
}

console.log('');
console.log(fallos === 0
  ? 'El camino de Meta funciona de punta a punta.'
  : `${fallos} cosa(s) fallan.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
