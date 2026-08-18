#!/usr/bin/env node
/**
 * Corre un handshake MCP completo contra el servidor y ejecuta las tres tools.
 *
 * Es la prueba que hace un cliente real —Claude o ChatGPT— al conectarse:
 * initialize, tools/list, y una llamada a cada herramienta. Si esto pasa, el
 * connector se conecta.
 *
 *   node scripts/verificar-mcp.mjs [https://dominio]
 */

const BASE = (process.argv[2] || 'https://www.quilmescorrugados.com.ar')
  .trim()
  .replace(/\/+$/, '');
const URL_MCP = `${BASE}/api/mcp`;

let n = 0;
const fallos = [];

async function rpc(method, params) {
  const res = await fetch(URL_MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'VerificadorMCP/1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  if (res.status === 202) return { notificacion: true };
  const texto = await res.text();
  try {
    return { status: res.status, ...JSON.parse(texto) };
  } catch {
    return { status: res.status, crudo: texto.slice(0, 200) };
  }
}

function comprobar(nombre, ok, detalle = '') {
  if (!ok) fallos.push(`${nombre}${detalle ? ': ' + detalle : ''}`);
  console.log(`  ${ok ? 'ok  ' : 'MAL '} ${nombre}${detalle ? '  ' + detalle : ''}`);
}

console.log(`\nHandshake MCP — ${URL_MCP}\n`);

// 1. initialize
const init = await rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'verificador', version: '1.0' },
});
comprobar('initialize responde', !!init.result, init.error?.message || `status ${init.status}`);
comprobar(
  'devuelve protocolVersion',
  !!init.result?.protocolVersion,
  init.result?.protocolVersion || '',
);
comprobar('anuncia capacidad de tools', !!init.result?.capabilities?.tools);
comprobar('trae instructions para el modelo', !!init.result?.instructions);

// 2. notification
const noti = await rpc('notifications/initialized', {});
comprobar('acepta notifications/initialized', noti.notificacion === true);

// 3. tools/list
const lista = await rpc('tools/list', {});
const tools = lista.result?.tools || [];
comprobar('tools/list devuelve herramientas', tools.length === 3, `${tools.length} tools`);
for (const t of tools) {
  const okEsquema = t.inputSchema?.type === 'object';
  const okDesc = (t.description || '').length > 80;
  comprobar(`  tool ${t.name}`, okEsquema && okDesc, okDesc ? '' : 'descripción corta');
}

// 4. Cada tool
console.log('\nEjecución de las tools\n');

const cotiza = await rpc('tools/call', {
  name: 'cotizar_cajas_carton',
  arguments: { largo_mm: 400, ancho_mm: 600, alto_mm: 600, cantidad: 3000, colores_impresion: 2 },
});
const textoCotiza = cotiza.result?.content?.[0]?.text || '';
comprobar('cotizar_cajas_carton devuelve texto', textoCotiza.length > 100);
comprobar('  incluye un precio', /\$[\d.]+/.test(textoCotiza));
comprobar('  incluye la plantilla', textoCotiza.includes('/api/box-template'));
comprobar('  incluye el link de WhatsApp', textoCotiza.includes('wa.me'));
comprobar('  trae structuredContent', !!cotiza.result?.structuredContent?.subtotal);
if (textoCotiza) console.log('\n    ' + textoCotiza.split('\n')[0].slice(0, 130) + '\n');

const plantilla = await rpc('tools/call', {
  name: 'plantilla_impresion',
  arguments: { largo_mm: 400, ancho_mm: 300, alto_mm: 300 },
});
comprobar(
  'plantilla_impresion devuelve el PDF',
  (plantilla.result?.content?.[0]?.text || '').includes('/api/box-template'),
);

const precios = await rpc('tools/call', { name: 'condiciones_y_precios', arguments: {} });
comprobar(
  'condiciones_y_precios devuelve la escalera',
  (precios.result?.content?.[0]?.text || '').includes('/m²'),
);

// 5. Errores: una medida imposible tiene que explicarse, no romper
const imposible = await rpc('tools/call', {
  name: 'cotizar_cajas_carton',
  arguments: { largo_mm: 5000, ancho_mm: 5000, alto_mm: 5000, cantidad: 10 },
});
comprobar('una medida imposible devuelve isError', imposible.result?.isError === true);
comprobar(
  '  y explica por qué',
  (imposible.result?.content?.[0]?.text || '').length > 40,
);

// 6. Método inexistente
const nope = await rpc('metodo/inexistente', {});
comprobar('método desconocido devuelve error JSON-RPC', nope.error?.code === -32601);

console.log();
if (fallos.length) {
  console.log(`${fallos.length} problema(s):\n`);
  fallos.forEach((f) => console.log('  · ' + f));
  console.log();
  process.exit(1);
}
console.log('El servidor MCP responde correctamente. Un cliente real se conecta.\n');
