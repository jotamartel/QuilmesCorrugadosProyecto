/**
 * Un pedido web con varias medidas queda guardado con todas.
 *
 * POR QUE
 *
 * El formulario deja cargar varias medidas, pero /api/public/leads guardaba
 * solo la primera (con el precio del escalón del pedido entero) y
 * /api/public/quotes tiraba additional_boxes. Ver cotizacion/web.ts y la
 * migración 042.
 *
 * Llama a los handlers EN PROCESO contra la base real, con un mail de prueba,
 * y con Telegram y el mail apagados para no avisarle al equipo. Borra lo que
 * deja.
 *
 *   npx tsx scripts/qa-cotizacion-varias-medidas.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true, quiet: true }); break; }
}
// Sin avisos al equipo: estas variables se leen al importar o al enviar.
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHAT_ID = '';
process.env.RESEND_API_KEY = '';

const { POST: postLead } = await import('@/app/api/public/leads/route');
const { POST: postQuote } = await import('@/app/api/public/quotes/route');
const { GET: getQuote } = await import('@/app/api/public/quotes/[id]/route');
const { calcularCajasWeb } = await import('@/lib/cotizacion/web');
const { getActivePricingConfig } = await import('@/lib/utils/pricing');
const { createAdminClient } = await import('@/lib/supabase/admin');
const { NextRequest } = await import('next/server');

const db = createAdminClient();
const MAIL_A = 'qa-varias-medidas-a@example.com';
const MAIL_B = 'qa-varias-medidas-b@example.com';
let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  if (c) console.log(`  ok   ${t}`);
  else { fallos++; console.log(`  FALLA ${t}${d ? `\n        ${d}` : ''}`); }
};

const post = (handler: (r: InstanceType<typeof NextRequest>) => Promise<Response>, url: string, body: unknown) =>
  handler(new NextRequest(`https://www.quilmescorrugados.com.ar${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

const limpiar = () => db.from('public_quotes').delete().in('requester_email', [MAIL_A, MAIL_B]);

const cajas = [
  { length_mm: 400, width_mm: 300, height_mm: 300, quantity: 1500, has_printing: false, printing_colors: 0, material: 'simple' },
  { length_mm: 700, width_mm: 500, height_mm: 500, quantity: 1500, has_printing: true, printing_colors: 2, material: 'dt120' },
  { length_mm: 300, width_mm: 200, height_mm: 150, quantity: 3000, has_printing: false, printing_colors: 0, material: 'simple' },
];
const contacto = (email: string) => ({
  requester_name: 'QA varias medidas', requester_email: email, requester_phone: '1100000000',
  client_type: 'empresa', requester_company: 'QA',
});

try {
  await limpiar();
  const config = (await getActivePricingConfig())!;
  const esperado = calcularCajasWeb(cajas, config);

  console.log('\nVer el precio (lead) con tres medidas');
  const rLead = await post(postLead, '/api/public/leads', { ...contacto(MAIL_A), boxes: cajas });
  ok('responde 201', rLead.status === 201, String(rLead.status));
  const lead = await rLead.json();
  const { data: filaLead } = await db.from('public_quotes').select('*').eq('id', lead.id).single();
  ok('guarda las tres medidas', filaLead?.items?.length === 3, JSON.stringify(filaLead?.items?.length));
  ok('el subtotal es la suma de las tres', filaLead?.subtotal === esperado.subtotal,
    `${filaLead?.subtotal} vs ${esperado.subtotal}`);
  ok('cada medida con su propio precio (la de doble triple a $1.800 con el 25%)',
    filaLead?.items?.[1]?.material === 'dt120' && filaLead?.items?.[1]?.price_per_m2 === 1800 * 1.25,
    JSON.stringify(filaLead?.items?.[1]));
  ok('el unitario de la fila es el de la primera medida',
    filaLead?.unit_price === esperado.items[0].unit_price, `${filaLead?.unit_price} vs ${esperado.items[0].unit_price}`);

  console.log('\n"Quiero que me contacten" sobre ese lead, después de cambiar una cantidad');
  const cambiadas = cajas.map((c, i) => (i === 2 ? { ...c, quantity: 4000 } : c));
  const [principal, ...resto] = cambiadas;
  const rQ = await post(postQuote, '/api/public/quotes', {
    ...contacto(MAIL_A), ...principal, additional_boxes: resto,
  });
  ok('responde 201', rQ.status === 201, String(rQ.status));
  const { data: filaQ } = await db.from('public_quotes').select('*').eq('id', lead.id).single();
  ok('actualiza el mismo lead', filaQ?.requested_contact === true);
  ok('con la cantidad nueva', filaQ?.items?.[2]?.quantity === 4000, JSON.stringify(filaQ?.items?.[2]));
  ok('y el total nuevo', filaQ?.subtotal === calcularCajasWeb(cambiadas, config).subtotal);

  console.log('\n"Quiero que me contacten" sin lead previo');
  const rNueva = await post(postQuote, '/api/public/quotes', {
    ...contacto(MAIL_B), ...cajas[0], additional_boxes: cajas.slice(1),
  });
  ok('responde 201', rNueva.status === 201, String(rNueva.status));
  const nueva = await rNueva.json();
  ok('guarda las tres medidas (antes additional_boxes se tiraba)', nueva.items?.length === 3,
    JSON.stringify(nueva.items?.length));
  ok('con el total de las tres', nueva.subtotal === esperado.subtotal, `${nueva.subtotal} vs ${esperado.subtotal}`);

  console.log('\nLa página del cliente recibe las medidas');
  const rGet = await getQuote(
    new NextRequest(`https://www.quilmescorrugados.com.ar/api/public/quotes/${nueva.id}`),
    { params: Promise.resolve({ id: nueva.id }) } as never,
  );
  const leida = await rGet.json();
  ok('trae items', leida.items?.length === 3, JSON.stringify(Object.keys(leida)));

  console.log('\nUna caja grande en las adicionales se acepta, una imposible no');
  const rGrande = await post(postQuote, '/api/public/quotes', {
    ...contacto(MAIL_B), ...cajas[0],
    additional_boxes: [{ length_mm: 1030, width_mm: 500, height_mm: 620, quantity: 300 }],
  });
  ok('1030x500x620 pasa', rGrande.status === 201, String(rGrande.status));
  const rImposible = await post(postQuote, '/api/public/quotes', {
    ...contacto(MAIL_B), ...cajas[0],
    additional_boxes: [{ length_mm: 900, width_mm: 800, height_mm: 700, quantity: 300 }],
  });
  const err = await rImposible.json();
  ok('900x800x700 se rechaza diciendo cuál', rImposible.status === 400 && /Caja 2/.test(err.error), err.error);
} finally {
  await limpiar();
}

console.log(fallos ? `\n${fallos} fallas\n` : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
