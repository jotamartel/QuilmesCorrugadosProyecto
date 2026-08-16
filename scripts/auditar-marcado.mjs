#!/usr/bin/env node
/**
 * Auditoria de marcado y tracking de las paginas publicas.
 *
 * Trae el HTML que realmente sirve el servidor —no el DOM despues de
 * hidratar— porque eso es lo que ve un crawler y lo que ve un asistente de
 * IA. Mide por pagina: metadatos, datos estructurados, contenido legible sin
 * JS, y que pixeles estan efectivamente instalados.
 *
 *   node scripts/auditar-marcado.mjs                      (produccion)
 *   node scripts/auditar-marcado.mjs http://localhost:3000
 *   node scripts/auditar-marcado.mjs --json               (salida procesable)
 */

const args = process.argv.slice(2);
const comoJson = args.includes('--json');
const BASE = (args.find((a) => !a.startsWith('--')) || 'https://quilmescorrugados.com.ar')
  .trim()
  .replace(/\/+$/, '');

const PAGINAS = [
  ['/', 'Home'],
  ['/precios', 'Precios'],
  ['/cajas', 'Compra minorista'],
  ['/mayorista', 'Mayorista'],
  ['/productos', 'Productos'],
  ['/cajas-ecommerce', 'Landing ecommerce'],
  ['/cajas-mudanza', 'Landing mudanza'],
  ['/cajas-alimentos', 'Landing alimentos'],
  ['/nosotros', 'Nosotros'],
  ['/faq', 'FAQ'],
  ['/contacto', 'Contacto'],
  ['/privacidad', 'Privacidad'],
  ['/api/v1/docs', 'Docs de la API'],
];

// Marcas de agua de cada plataforma en el HTML servido.
const PIXELES = [
  ['Meta Pixel', /connect\.facebook\.net|fbevents\.js|fbq\(/],
  ['Google Analytics 4', /gtag\/js\?id=G-|gtag\('config',\s*'G-/],
  ['Google Ads', /gtag\/js\?id=AW-|gtag\('config',\s*'AW-|googleadservices/],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ['LinkedIn Insight', /snap\.licdn\.com|_linkedin_partner_id/],
  ['TikTok Pixel', /analytics\.tiktok\.com|ttq\.load/],
  ['Clarity / Hotjar', /clarity\.ms|static\.hotjar\.com/],
];

const entre = (html, re) => (html.match(re)?.[1] ?? '').trim();

function texto(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tiposJsonLd(html) {
  const tipos = new Set();
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const recorrer = (n) => {
        if (Array.isArray(n)) return n.forEach(recorrer);
        if (!n || typeof n !== 'object') return;
        if (n['@type']) [].concat(n['@type']).forEach((t) => tipos.add(t));
        Object.values(n).forEach(recorrer);
      };
      recorrer(JSON.parse(m[1]));
    } catch {
      tipos.add('(JSON-LD invalido)');
    }
  }
  return [...tipos];
}

async function auditar(ruta, nombre) {
  const url = `${BASE}${ruta}`;
  let res, html;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'QuilmesAudit/1.0 (+auditoria interna de marcado)' },
    });
    html = await res.text();
  } catch (e) {
    return { ruta, nombre, error: e.message };
  }

  const plano = texto(html);
  const title = entre(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => texto(m[1]));

  return {
    ruta,
    nombre,
    status: res.status,
    title,
    largoTitle: title.length,
    description: entre(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    canonical: entre(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    ogTitle: entre(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogImage: entre(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
    jsonLd: tiposJsonLd(html),
    h1: h1s,
    palabras: plano.split(' ').filter(Boolean).length,
    // Lo que le importa a un asistente que quiere responder con datos duros.
    tienePrecio: /\$\s?\d{2,}/.test(plano),
    mencionaApi: /\/api\/v1\/quote/.test(html),
    tieneNoscript: /<noscript/i.test(html),
    pixeles: PIXELES.filter(([, re]) => re.test(html)).map(([n]) => n),
  };
}

const resultados = [];
for (const [ruta, nombre] of PAGINAS) resultados.push(await auditar(ruta, nombre));

if (comoJson) {
  console.log(JSON.stringify({ base: BASE, paginas: resultados }, null, 2));
  process.exit(0);
}

const si = (v) => (v ? 'si' : 'NO');
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

console.log(`\nAuditoria de marcado — ${BASE}\n`);
console.log(
  pad('PAGINA', 20),
  pad('ST', 4),
  pad('TITLE', 6),
  pad('DESC', 5),
  pad('CANON', 6),
  pad('OG', 3),
  pad('H1', 3),
  pad('PALAB', 6),
  pad('$', 3),
  pad('API', 4),
  'JSON-LD'
);
console.log('-'.repeat(110));

for (const r of resultados) {
  if (r.error) {
    console.log(pad(r.nombre, 20), 'ERROR', r.error);
    continue;
  }
  console.log(
    pad(r.nombre, 20),
    pad(r.status, 4),
    pad(r.largoTitle || 'NO', 6),
    pad(si(r.description), 5),
    pad(si(r.canonical), 6),
    pad(si(r.ogTitle), 3),
    pad(r.h1.length, 3),
    pad(r.palabras, 6),
    pad(si(r.tienePrecio), 3),
    pad(si(r.mencionaApi), 4),
    r.jsonLd.join(', ') || '—'
  );
}

// Los pixeles se reportan aparte: lo que importa es si estan en TODAS las
// paginas, porque uno que falta en una landing es una audiencia que se pierde.
console.log('\nTracking instalado (en el HTML servido)\n');
const conError = resultados.filter((r) => !r.error);
const todas = new Set(conError.flatMap((r) => r.pixeles));
if (todas.size === 0) {
  console.log('  ninguna plataforma de las buscadas aparece en el HTML servido');
  console.log(`  buscadas: ${PIXELES.map(([n]) => n).join(', ')}`);
} else {
  for (const p of todas) {
    const dondeNo = conError.filter((r) => !r.pixeles.includes(p)).map((r) => r.ruta);
    console.log(
      `  ${pad(p, 22)} ${conError.length - dondeNo.length}/${conError.length} paginas` +
        (dondeNo.length ? `  — falta en: ${dondeNo.join(' ')}` : '')
    );
  }
}

// Huecos accionables, ordenados por lo que mas cuesta en trafico.
const huecos = [];
const push = (sev, m) => huecos.push(`  [${sev}] ${m}`);
for (const r of conError) {
  if (r.status !== 200) push('alta', `${r.ruta} responde ${r.status}`);
  if (!r.title) push('alta', `${r.ruta} sin <title>`);
  if (!r.description) push('alta', `${r.ruta} sin meta description`);
  if (!r.canonical) push('media', `${r.ruta} sin canonical`);
  if (!r.ogTitle) push('media', `${r.ruta} sin Open Graph (mal preview al compartir)`);
  if (r.h1.length === 0) push('media', `${r.ruta} sin H1`);
  if (r.h1.length > 1) push('baja', `${r.ruta} tiene ${r.h1.length} H1`);
  if (r.jsonLd.length === 0) push('media', `${r.ruta} sin datos estructurados`);
  if (r.palabras < 120) push('media', `${r.ruta} tiene ${r.palabras} palabras legibles sin JS`);
  if (r.largoTitle > 62) push('baja', `${r.ruta} title de ${r.largoTitle} chars (se corta en Google)`);
}

console.log(`\nHuecos detectados: ${huecos.length}\n`);
const orden = { alta: 0, media: 1, baja: 2 };
huecos
  .sort((a, b) => orden[a.match(/\[(\w+)\]/)[1]] - orden[b.match(/\[(\w+)\]/)[1]])
  .forEach((h) => console.log(h));
console.log();
