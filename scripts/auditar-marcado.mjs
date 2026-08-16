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
//
// Cuidado con esta lista: next/script con strategy="afterInteractive" NO
// inlinea el codigo en el HTML, lo inyecta despues de hidratar. Buscar el
// snippet de fbq da un falso negativo y hace parecer que el pixel no existe
// cuando esta perfectamente instalado. Lo que si queda en el HTML servido es
// el <noscript> con facebook.com/tr, que es la marca confiable.
const PIXELES = [
  ['Meta Pixel', /connect\.facebook\.net|fbevents\.js|fbq\(|facebook\.com\/tr\?id=\d+/],
  ['Google Analytics 4', /gtag\/js\?id=G-|gtag\('config',\s*'G-|[?&]id=G-[A-Z0-9]{6,}/],
  ['Google Ads', /gtag\/js\?id=AW-|gtag\('config',\s*'AW-|googleadservices|AW-\d{6,}/],
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

/**
 * Jerarquia de encabezados: detecta saltos (un H4 colgando de un H2) y si el
 * H1 repite el title, que es desperdiciar el encabezado mas importante en
 * decir dos veces lo mismo.
 */
function encabezados(html) {
  const lista = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    nivel: Number(m[1]),
    texto: texto(m[2]),
  }));
  const saltos = [];
  for (let i = 1; i < lista.length; i++) {
    if (lista[i].nivel > lista[i - 1].nivel + 1) {
      saltos.push(`H${lista[i - 1].nivel}→H${lista[i].nivel} (${lista[i].texto.slice(0, 40)})`);
    }
  }
  return { lista, saltos };
}

function imagenes(html) {
  const todas = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  // alt="" vacio es CORRECTO en una imagen decorativa o en un pixel de
  // seguimiento: le dice al lector de pantalla que la saltee. Lo que hay que
  // reportar es la ausencia del atributo, no un alt deliberadamente vacio.
  const sinAlt = todas.filter((t) => !/\balt\s*=/i.test(t));
  const nombresPobres = todas
    .map((t) => t.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '')
    .filter((s) => s && /\/(img|image|foto|pic|IMG_)?[-_]?\d+\.(jpe?g|png|webp|avif)/i.test(s));
  return { total: todas.length, sinAlt: sinAlt.length, nombresPobres: nombresPobres.length };
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
  const enc = encabezados(html);
  const img = imagenes(html);

  // Enlaces internos: es lo que mide si la pagina participa de un cluster o
  // esta colgada sola. Se descartan anclas y el propio path.
  const internos = new Set(
    [...html.matchAll(/href=["'](\/[^"'#?]*)["']/g)]
      .map((m) => m[1].replace(/\/$/, ''))
      .filter((h) => h && h !== ruta.replace(/\/$/, '')),
  );

  return {
    encabezados: enc.lista.map((h) => `H${h.nivel}`).join(''),
    saltosDeNivel: enc.saltos,
    h1IgualAlTitle: h1s.length > 0 && !!title && title.toLowerCase().includes(h1s[0].toLowerCase()),
    imagenes: img.total,
    imagenesSinAlt: img.sinAlt,
    imagenesMalNombradas: img.nombresPobres,
    enlacesInternos: internos.size,
    // Un resumen arriba de todo es lo que un asistente cita textual.
    tieneResumen: /en resumen|resumen rapido|lo importante|key takeaways|tl;dr|en corto/i.test(plano),
    tablas: (html.match(/<table\b/gi) || []).length,
    listas: (html.match(/<[uo]l\b/gi) || []).length,
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

// Titles y descriptions repetidos: Google elige una pagina y descarta el resto.
const porTitle = new Map();
const porDesc = new Map();
for (const r of conError) {
  if (r.title) porTitle.set(r.title, [...(porTitle.get(r.title) || []), r.ruta]);
  if (r.description) porDesc.set(r.description, [...(porDesc.get(r.description) || []), r.ruta]);
}
for (const [t, rutas] of porTitle) {
  if (rutas.length > 1) push('alta', `title repetido en ${rutas.join(' ')}: "${t.slice(0, 50)}"`);
}
for (const [, rutas] of porDesc) {
  if (rutas.length > 1) push('alta', `meta description repetida en ${rutas.join(' ')}`);
}

for (const r of conError) {
  if (r.status !== 200) push('alta', `${r.ruta} responde ${r.status}`);
  if (!r.title) push('alta', `${r.ruta} sin <title>`);
  if (!r.description) push('alta', `${r.ruta} sin meta description`);
  if (r.imagenesSinAlt > 0) push('alta', `${r.ruta}: ${r.imagenesSinAlt} de ${r.imagenes} imagenes sin alt`);
  if (!r.canonical) push('media', `${r.ruta} sin canonical`);
  if (r.canonical && !r.canonical.startsWith(BASE)) {
    push('alta', `${r.ruta} canonical apunta a otro dominio: ${r.canonical}`);
  }
  if (!r.ogTitle) push('media', `${r.ruta} sin Open Graph (mal preview al compartir)`);
  if (r.h1.length === 0) push('media', `${r.ruta} sin H1`);
  if (r.h1.length > 1) push('baja', `${r.ruta} tiene ${r.h1.length} H1`);
  if (r.h1IgualAlTitle) push('media', `${r.ruta}: el H1 repite el title, se pierde una variante de busqueda`);
  if (r.saltosDeNivel.length) push('baja', `${r.ruta} saltea niveles: ${r.saltosDeNivel.join('; ')}`);
  if (r.jsonLd.length === 0) push('media', `${r.ruta} sin datos estructurados`);
  if (!r.jsonLd.includes('FAQPage')) push('media', `${r.ruta} sin schema de FAQ`);
  if (!r.tieneResumen) push('media', `${r.ruta} sin resumen arriba (lo que un asistente cita textual)`);
  if (r.enlacesInternos < 8) push('media', `${r.ruta} enlaza a solo ${r.enlacesInternos} paginas internas`);
  if (r.imagenesMalNombradas > 0) push('baja', `${r.ruta}: ${r.imagenesMalNombradas} imagenes con nombre generico`);
  if (r.palabras < 120) push('media', `${r.ruta} tiene ${r.palabras} palabras legibles sin JS`);
  if (r.largoTitle > 62) push('baja', `${r.ruta} title de ${r.largoTitle} chars (se corta en Google)`);
}

console.log(`\nHuecos detectados: ${huecos.length}\n`);
const orden = { alta: 0, media: 1, baja: 2 };
huecos
  .sort((a, b) => orden[a.match(/\[(\w+)\]/)[1]] - orden[b.match(/\[(\w+)\]/)[1]])
  .forEach((h) => console.log(h));
console.log();
