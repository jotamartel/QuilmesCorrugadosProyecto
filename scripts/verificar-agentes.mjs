#!/usr/bin/env node
/**
 * Comprueba la preparación del sitio para agentes de IA: negociación de
 * markdown (acceptmarkdown.com), 404 con salidas, descubrimiento MCP
 * (/.well-known), portal de developers, redirects de páginas de confianza,
 * alias de OpenAPI y el JSON-LD del negocio.
 *
 * Todo es de solo lectura: GETs sin cuerpo, sin credenciales. Se puede correr
 * contra producción o contra un `next start` local.
 *
 *   node scripts/verificar-agentes.mjs [https://dominio]
 */

const BASE = (process.argv[2] || 'https://www.quilmescorrugados.com.ar')
  .trim()
  .replace(/\/+$/, '');

let fallas = 0;
let corridas = 0;

function ok(nombre, condicion, detalle = '') {
  corridas++;
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    fallas++;
    console.log(`FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${BASE}${ruta}`, { redirect: 'manual', ...opciones });
  const cuerpo = await res.text();
  return { res, cuerpo };
}

/**
 * Si Vary lleva `Accept` como MIEMBRO, no como substring: "Accept-Encoding"
 * contiene "accept" y ya nos hizo pasar por bueno un header que no lo era.
 */
function varyIncluyeAccept(res) {
  return (res.headers.get('vary') || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .includes('accept');
}

// ── 1. Negociación de markdown (acceptmarkdown.com) ─────────────────────────
console.log('\n— Negociación de markdown —');
{
  const { res, cuerpo } = await pedir('/', { headers: { Accept: 'text/markdown' } });
  ok('/ con Accept: text/markdown responde 200', res.status === 200, `status ${res.status}`);
  ok(
    'Content-Type es text/markdown; charset=utf-8',
    (res.headers.get('content-type') || '').toLowerCase().startsWith('text/markdown'),
    res.headers.get('content-type') || '(sin content-type)',
  );
  ok('Vary incluye Accept como miembro', varyIncluyeAccept(res), res.headers.get('vary') || '(sin vary)');
  ok('el cuerpo es markdown (arranca con #)', cuerpo.trimStart().startsWith('#'));
  ok('el markdown nombra la API de cotización', cuerpo.includes('/api/v1/quote'));
}
{
  // q-values: si el cliente prefiere HTML, recibe HTML.
  const { res } = await pedir('/', {
    headers: { Accept: 'text/markdown;q=0.5, text/html' },
  });
  ok(
    'q-values: text/html preferido gana',
    (res.headers.get('content-type') || '').includes('text/html'),
    res.headers.get('content-type') || '(sin content-type)',
  );
}
{
  // Un navegador normal sigue recibiendo HTML con Vary: Accept.
  const { res } = await pedir('/', {
    headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
  });
  ok('navegador recibe text/html', (res.headers.get('content-type') || '').includes('text/html'));
  // El Vary del HTML lo arma Next (rsc, next-router-*): el middleware no
  // consigue sumarle Accept y no lo peleamos — la spec lo exige en la
  // respuesta NEGOCIADA (la de markdown, chequeada arriba), y como la
  // negociación corre en el middleware, antes del caché, no hay forma de que
  // un caché sirva el formato equivocado.
}
{
  // 406 cuando el cliente no acepta nada de lo que servimos.
  const { res } = await pedir('/', { headers: { Accept: 'application/x-inexistente' } });
  ok('Accept sin tipos servibles devuelve 406', res.status === 406, `status ${res.status}`);
}
{
  // Otras páginas también negocian.
  const { res } = await pedir('/precios', { headers: { Accept: 'text/markdown' } });
  ok(
    '/precios también responde markdown',
    res.status === 200 && (res.headers.get('content-type') || '').startsWith('text/markdown'),
    `status ${res.status}, ${res.headers.get('content-type')}`,
  );
}

// ── 2. 404 con salidas ──────────────────────────────────────────────────────
console.log('\n— 404 para agentes —');
{
  const { res, cuerpo } = await pedir('/una-ruta-que-no-existe-xyz');
  ok('ruta inexistente devuelve 404', res.status === 404, `status ${res.status}`);
  ok('el 404 HTML trae el link a llms.txt', cuerpo.includes('/llms.txt'));
  ok('el 404 HTML trae el link al sitemap', cuerpo.includes('/sitemap.xml'));
}
{
  const { res, cuerpo } = await pedir('/una-ruta-que-no-existe-xyz', {
    headers: { Accept: 'text/markdown' },
  });
  ok('404 negociado en markdown mantiene el status', res.status === 404, `status ${res.status}`);
  ok(
    '404 markdown con content-type correcto',
    (res.headers.get('content-type') || '').startsWith('text/markdown'),
    res.headers.get('content-type') || '(sin content-type)',
  );
  ok('404 markdown lleva Vary: Accept', varyIncluyeAccept(res), res.headers.get('vary') || '(sin vary)');
  ok('404 markdown trae salidas (llms.txt)', cuerpo.includes('/llms.txt'));
}

// ── 3. Descubrimiento MCP ───────────────────────────────────────────────────
console.log('\n— Descubrimiento MCP (/.well-known) —');
for (const ruta of ['/.well-known/mcp.json', '/.well-known/mcp/server-card.json']) {
  const { res, cuerpo } = await pedir(ruta);
  ok(`${ruta} responde 200 JSON`, res.status === 200 && (res.headers.get('content-type') || '').includes('application/json'), `status ${res.status}`);
  try {
    const card = JSON.parse(cuerpo);
    ok(
      `${ruta} tiene los campos del server card`,
      ['$schema', 'version', 'protocolVersion', 'serverInfo', 'transport', 'capabilities'].every(
        (campo) => campo in card,
      ),
      `campos: ${Object.keys(card).join(', ')}`,
    );
    ok(
      `${ruta} declara streamable-http hacia /api/mcp`,
      card.transport?.type === 'streamable-http' && String(card.transport?.url).endsWith('/api/mcp'),
    );
  } catch {
    ok(`${ruta} es JSON válido`, false);
  }
}
{
  const { res, cuerpo } = await pedir('/.well-known/mcp');
  ok('/.well-known/mcp responde 200 JSON', res.status === 200, `status ${res.status}`);
  try {
    const manifiesto = JSON.parse(cuerpo);
    ok(
      '/.well-known/mcp tiene mcp_version y endpoints',
      typeof manifiesto.mcp_version === 'string' && Array.isArray(manifiesto.endpoints) && manifiesto.endpoints.length > 0,
    );
  } catch {
    ok('/.well-known/mcp es JSON válido', false);
  }
}
{
  const { res, cuerpo } = await pedir('/mcp');
  ok('/mcp (alias) responde 200', res.status === 200, `status ${res.status}`);
  ok('/mcp describe el servidor', cuerpo.includes('cotizar_cajas_carton'));
}

// ── 4. Portal de developers y recursos con nombre predecible ────────────────
console.log('\n— Developers y recursos —');
{
  const { res, cuerpo } = await pedir('/developers');
  ok('/developers responde 200', res.status === 200, `status ${res.status}`);
  ok('/developers nombra la marca en el título', /<title>[^<]*Quilmes Corrugados/i.test(cuerpo));
  ok('/developers linkea OpenAPI y MCP', cuerpo.includes('openapi.json') && cuerpo.includes('/api/mcp'));
}
{
  const { res, cuerpo } = await pedir('/openapi.json');
  ok('/openapi.json (alias) responde 200', res.status === 200, `status ${res.status}`);
  try {
    ok('/openapi.json es una spec OpenAPI', 'openapi' in JSON.parse(cuerpo));
  } catch {
    ok('/openapi.json es JSON válido', false);
  }
}
{
  const { cuerpo } = await pedir('/llms.txt');
  ok('llms.txt tiene la sección de cuándo usarnos', cuerpo.includes('Cuándo usarnos (when to use)'));
  ok('llms.txt lista /developers', cuerpo.includes('/developers'));
  ok('llms.txt lista el descubrimiento MCP', cuerpo.includes('/.well-known/mcp.json'));
}

// ── 5. Páginas de confianza con nombre en inglés ────────────────────────────
console.log('\n— Trust anchors —');
for (const [origen, destino] of [
  ['/about', '/nosotros'],
  ['/privacy', '/privacidad'],
  ['/contact', '/contacto'],
  ['/terms', '/terminos'],
]) {
  const { res } = await pedir(origen);
  const location = res.headers.get('location') || '';
  ok(
    `${origen} redirige a ${destino}`,
    res.status >= 301 && res.status <= 308 && location.includes(destino),
    `status ${res.status}, location ${location || '(sin location)'}`,
  );
}

// ── 6. JSON-LD del negocio ──────────────────────────────────────────────────
console.log('\n— Organization schema —');
{
  const { cuerpo } = await pedir('/');
  ok('la home declara contactPoint en el JSON-LD', cuerpo.includes('"contactPoint"'));
  ok('el contactPoint trae contactType', cuerpo.includes('"contactType"'));
  ok('el JSON-LD trae PostalAddress', cuerpo.includes('"PostalAddress"'));
}

console.log(`\n${corridas} chequeos, ${fallas} fallas ${fallas === 0 ? '— TODO OK' : ''}`);
process.exit(fallas === 0 ? 0 : 1);
