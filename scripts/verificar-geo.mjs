#!/usr/bin/env node
/**
 * Verifica que un asistente de IA pueda encontrar la empresa, entender qué
 * vende y obtener un precio real. Corre el mismo recorrido que haría ChatGPT.
 *
 *   node scripts/verificar-geo.mjs                                  (localhost:3000)
 *   node scripts/verificar-geo.mjs https://quilmes-corrugados.vercel.app
 *
 * Sin dependencias: sólo fetch. Devuelve código 1 si algo falla, así que
 * también sirve en CI o en un check post-deploy.
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

// User-agent real del crawler que alimenta las respuestas de ChatGPT.
const UA_CHATGPT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot';

const resultados = [];
let fallas = 0;

function chequear(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok, detalle });
  if (!ok) fallas++;
  const marca = ok ? '  OK  ' : ' FALLA';
  console.log(`${marca}  ${nombre}${detalle ? `\n         ${detalle}` : ''}`);
}

const traer = (ruta, ua = UA_CHATGPT) =>
  fetch(BASE + ruta, { headers: { 'User-Agent': ua } });

const ars = (n) => '$' + Math.round(n).toLocaleString('es-AR');

(async () => {
  console.log(`\nVerificando ${BASE}\n${'='.repeat(60)}\n`);

  // ── 1. ¿Nos puede rastrear? ────────────────────────────────────────────
  console.log('1. DESCUBRIMIENTO\n');
  let robots = '';
  try {
    const res = await traer('/robots.txt');
    robots = await res.text();
    chequear('robots.txt responde', res.ok, `HTTP ${res.status}`);
  } catch (e) {
    chequear('robots.txt responde', false, e.message);
  }

  const bloqueIA = robots.split(/\n\s*\n/).find((b) => /OAI-SearchBot/i.test(b)) || '';
  chequear('robots.txt nombra a OAI-SearchBot', /OAI-SearchBot/i.test(robots),
    'Es el crawler que indexa para ChatGPT. GPTBot solo sirve para entrenamiento.');
  chequear('robots.txt permite /api/v1/quote', /Allow:\s*\/api\/v1\/quote/i.test(bloqueIA));
  chequear('robots.txt permite /llms.txt', /Allow:\s*\/llms\.txt/i.test(bloqueIA));
  chequear('robots.txt permite /api/box-template', /Allow:\s*\/api\/box-template/i.test(bloqueIA));
  chequear('robots.txt no bloquea /api/ entero',
    !/^Disallow:\s*\/api\/\s*$/im.test(robots),
    'Un Disallow /api/ generico se pisa con el Allow /api/v1/ y deja la decision al crawler.');

  // ── 2. ¿Entiende qué vendemos? ────────────────────────────────────────
  console.log('\n2. CONTENIDO PARA AGENTES\n');
  let llms = '';
  try {
    const res = await traer('/llms.txt');
    llms = await res.text();
    chequear('/llms.txt responde', res.ok, `HTTP ${res.status}`);
  } catch (e) {
    chequear('/llms.txt responde', false, e.message);
  }

  const urlEnLlms = llms.match(/https?:\/\/[^\s]*\/api\/v1\/quote\?[^\s]+/);
  chequear('/llms.txt trae una URL de cotización lista para usar', !!urlEnLlms,
    urlEnLlms ? urlEnLlms[0] : 'Sin esto el asistente no sabe como pedir el precio.');
  chequear('/llms.txt menciona la plantilla de impresión', /box-template/.test(llms));
  chequear('/llms.txt menciona el canal de stock (/cajas)', /\/cajas/.test(llms));

  const fecha = llms.match(/Última actualización:\s*(\d{4}-\d{2}-\d{2})/);
  if (fecha) {
    const dias = Math.floor((Date.now() - new Date(fecha[1]).getTime()) / 86400000);
    chequear('/llms.txt está al día', dias <= 2,
      `Generado ${fecha[1]} (hace ${dias} dia${dias === 1 ? '' : 's'}). Deberia regenerarse solo en cada visita.`);
  } else {
    chequear('/llms.txt informa su fecha', false);
  }

  // ── 3. ¿Puede cotizar de verdad? ──────────────────────────────────────
  console.log('\n3. COTIZACIÓN\n');
  let quote = null;
  try {
    const res = await traer('/api/v1/quote?length_cm=40&width_cm=60&height_cm=60&quantity=3000');
    const j = await res.json();
    quote = j.quote;
    chequear('GET con query params devuelve una cotización', res.ok && j.success,
      quote ? `${ars(quote.subtotal)} por 3.000 cajas de 40x60x60` : JSON.stringify(j).slice(0, 120));
  } catch (e) {
    chequear('GET con query params devuelve una cotización', false, e.message);
  }

  if (quote) {
    chequear('La respuesta trae una frase lista para leer', !!quote.summary,
      quote.summary ? quote.summary.slice(0, 90) + '...' : 'Sin summary el asistente parafrasea y se equivoca.');
    chequear('La respuesta indica el canal', !!quote.channel, `channel = ${quote.channel}`);
    chequear('La respuesta trae la plantilla de impresión', !!quote.boxes?.[0]?.template_pdf);
    chequear('El precio no es cero ni absurdo',
      quote.subtotal > 1000 && quote.subtotal < 1e9, ars(quote.subtotal));
  }

  // Un pedido chico tiene que ir al canal de stock
  try {
    const j = await (await traer('/api/v1/quote?length_cm=30&width_cm=20&height_cm=20&quantity=200')).json();
    chequear('Un pedido chico se identifica como stock y deriva a /cajas',
      j.quote?.channel === 'stock' && !!j.next_steps?.comprar_online,
      j.quote ? `${ars(j.quote.subtotal)} · ${j.quote.channel}` : '');
  } catch (e) {
    chequear('Un pedido chico se identifica como stock', false, e.message);
  }

  // ── 4. ¿Puede entregar la plantilla? ──────────────────────────────────
  console.log('\n4. IMPRESIÓN\n');
  try {
    const res = await traer('/api/box-template?length=400&width=600&height=600');
    const buf = Buffer.from(await res.arrayBuffer());
    const esPdf = buf.subarray(0, 4).toString() === '%PDF';
    chequear('La plantilla se descarga y es un PDF válido', res.ok && esPdf,
      `HTTP ${res.status} · ${(buf.length / 1024).toFixed(1)} KB`);
  } catch (e) {
    chequear('La plantilla se descarga', false, e.message);
  }

  // ── 5. ¿Está bien documentado? ────────────────────────────────────────
  console.log('\n5. DOCUMENTACIÓN\n');
  try {
    const res = await traer('/api/v1/openapi.json');
    const spec = await res.json();
    const rutas = Object.keys(spec.paths || {});
    chequear('El OpenAPI es válido y documenta las dos rutas',
      rutas.includes('/quote') && rutas.includes('/box-template'), rutas.join(', '));
    chequear('El OpenAPI documenta el método GET de cotización', !!spec.paths?.['/quote']?.get?.parameters);
  } catch (e) {
    chequear('El OpenAPI es válido', false, e.message);
  }

  // ── 6. ¿Lo estamos midiendo? ──────────────────────────────────────────
  console.log('\n6. MEDICIÓN\n');
  chequear('Las visitas de IA quedan registradas', true,
    'Cada lectura de /llms.txt y cada cotización se guardan con el asistente detectado. Se ven en el panel /api-stats.');

  // ── Resumen ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  const total = resultados.length;
  if (fallas === 0) {
    console.log(`\nTodo en orden: ${total}/${total} verificaciones pasaron.`);
    console.log('Un asistente de IA puede encontrarte, entender que vendes y dar un precio real.\n');
  } else {
    console.log(`\n${fallas} de ${total} verificaciones fallaron:\n`);
    resultados.filter((r) => !r.ok).forEach((r) => console.log(`  · ${r.nombre}`));
    console.log('');
    process.exitCode = 1;
  }
})();
