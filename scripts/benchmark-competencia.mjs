#!/usr/bin/env node
/**
 * Benchmark de fabricantes de corrugado en Argentina.
 *
 * No mide diseno ni catalogo: mide exactamente las capas por las que se
 * compite hoy para aparecer en una respuesta de IA y para cerrar sin fricción.
 *
 *   node scripts/benchmark-competencia.mjs
 */

const COMPETIDORES = [
  ['Quilmes Corrugados', 'https://quilmescorrugados.com.ar'],
  ['Maranz', 'https://www.maranz.com.ar'],
  ['Todocajas', 'https://www.todocajas.com.ar'],
  ['Converpack', 'https://www.converpack.com.ar'],
  ['Bemposta', 'https://www.bemposta.com.ar'],
  ['MarketPaper', 'https://marketpaper.com.ar'],
  ['ReyCaja', 'https://www.reycaja.com.ar'],
  ['EG Corrugados', 'https://egcorrugados.com.ar'],
  ['Corrugados Chacabuco', 'https://corrugados.com.ar'],
  ['Papelera Damian', 'https://www.papeleradamian.com'],
  ['Megga Insumos', 'https://meggainsumos.com.ar'],
];

const UA = 'Mozilla/5.0 (compatible; QuilmesBenchmark/1.0)';
const TIMEOUT = 20000;

async function traer(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    return { ok: r.ok, status: r.status, texto: r.ok ? await r.text() : '' };
  } catch (e) {
    return { ok: false, status: 0, texto: '', error: e.name };
  } finally {
    clearTimeout(t);
  }
}

function tiposJsonLd(html) {
  const tipos = new Set();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const rec = (n) => {
        if (Array.isArray(n)) return n.forEach(rec);
        if (!n || typeof n !== 'object') return;
        if (n['@type']) [].concat(n['@type']).forEach((t) => tipos.add(t));
        Object.values(n).forEach(rec);
      };
      rec(JSON.parse(m[1]));
    } catch { /* JSON-LD roto: no cuenta */ }
  }
  return [...tipos];
}

async function medir(nombre, base) {
  const home = await traer(base);
  if (!home.ok) return { nombre, base, caido: true, status: home.status, error: home.error };

  const html = home.texto;
  const plano = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const [llms, robots] = await Promise.all([traer(`${base}/llms.txt`), traer(`${base}/robots.txt`)]);

  // Un llms.txt real empieza con un H1 markdown; muchos 404 devuelven el HTML
  // del sitio con status 200, asi que hay que mirar el contenido.
  const llmsReal = llms.ok && !/<html/i.test(llms.texto) && /^#\s/m.test(llms.texto);

  const rb = robots.ok ? robots.texto.toLowerCase() : '';
  const nombraIA = /gptbot|oai-searchbot|claudebot|perplexitybot|google-extended|anthropic/.test(rb);
  const bloqueaIA = /user-agent:\s*(gptbot|oai-searchbot|claudebot|perplexitybot)[\s\S]{0,200}?disallow:\s*\//.test(rb);

  return {
    nombre,
    base,
    // Precio publico en la home, sin pedir datos.
    precioEnHome: /\$\s?\d{1,3}[.,]?\d{2,}/.test(plano),
    // Un cotizador de verdad (calcula) vs un formulario de "te contactamos".
    cotizadorInstantaneo: /cotiz|calculadora|presupuest/i.test(plano) && /precio al instante|al instante|calcul/i.test(plano),
    formularioContacto: /cotiz|presupuest|consult/i.test(plano),
    llmsTxt: llmsReal,
    robotsNombraIA: nombraIA,
    robotsBloqueaIA: bloqueaIA,
    schema: tiposJsonLd(html),
    tieneProductSchema: tiposJsonLd(html).some((t) => /^(Product|Offer|AggregateOffer)$/.test(t)),
    // Una API publica de cotizacion. Es la capa donde hoy no juega nadie.
    apiEnHome: /\/api\/[\w/-]*(quote|cotiz|price|precio)/i.test(html),
  };
}

const filas = [];
for (const [n, u] of COMPETIDORES) {
  process.stderr.write(`  midiendo ${n}...\n`);
  filas.push(await medir(n, u));
}

const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const si = (v) => (v ? 'SI' : '-');

console.log('\nBenchmark — fabricantes y vendedores de corrugado en Argentina\n');
console.log(
  pad('EMPRESA', 22),
  pad('PRECIO', 7),
  pad('COTIZ', 6),
  pad('llms', 5),
  pad('robots', 7),
  pad('API', 4),
  'SCHEMA'
);
console.log('-'.repeat(95));

for (const f of filas) {
  if (f.caido) {
    console.log(pad(f.nombre, 22), `no responde (${f.error || f.status})`);
    continue;
  }
  console.log(
    pad(f.nombre, 22),
    pad(si(f.precioEnHome), 7),
    pad(f.cotizadorInstantaneo ? 'instant' : f.formularioContacto ? 'form' : '-', 6),
    pad(si(f.llmsTxt), 5),
    pad(f.robotsBloqueaIA ? 'BLOQUEA' : f.robotsNombraIA ? 'nombra' : '-', 7),
    pad(si(f.apiEnHome), 4),
    f.tieneProductSchema ? f.schema.filter((t) => /Product|Offer/.test(t)).join(',') : f.schema.slice(0, 3).join(',') || '—'
  );
}

const vivos = filas.filter((f) => !f.caido);
const cuenta = (k) => vivos.filter((f) => f[k]).length;
console.log(`\nSobre ${vivos.length} sitios que responden:\n`);
console.log(`  con precio visible en la home    ${cuenta('precioEnHome')}`);
console.log(`  con cotizador instantaneo        ${cuenta('cotizadorInstantaneo')}`);
console.log(`  con llms.txt                     ${cuenta('llmsTxt')}`);
console.log(`  que nombran crawlers de IA       ${cuenta('robotsNombraIA')}`);
console.log(`  con API de cotizacion publica    ${cuenta('apiEnHome')}`);
console.log(`  con schema Product/Offer         ${cuenta('tieneProductSchema')}`);
console.log();
