#!/usr/bin/env node
/**
 * CLI oficial de Quilmes Corrugados.
 *
 * Un wrapper fino de la API pública: mismo motor, mismo precio que el sitio.
 * Sin dependencias a propósito — fetch nativo de Node 18+ y nada más, para que
 * `npx quilmes-corrugados` arranque sin instalar medio npm.
 *
 *   quilmes-corrugados cotizar 400x600x600 3000
 *   quilmes-corrugados cotizar 40x60x60cm 3000 --colores 2 --json
 *   quilmes-corrugados precios
 *   quilmes-corrugados plantilla 400x300x300 -o troquel.pdf
 *
 * Códigos de salida: 0 = ok (hay precio), 2 = el pedido no se puede vender
 * (la salida dice por qué), 1 = error de uso o de red. Pensado para scripts:
 * con --json imprime la respuesta cruda de la API.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const BASE = (process.env.QUILMES_API_URL || 'https://www.quilmescorrugados.com.ar').replace(/\/+$/, '');

const AYUDA = `quilmes-corrugados — cotizá cajas de cartón corrugado (Argentina) desde la terminal

USO
  quilmes-corrugados cotizar <LARGOxANCHOxALTO[cm]> <cantidad> [--colores N] [--json]
  quilmes-corrugados precios [--json]
  quilmes-corrugados plantilla <LARGOxANCHOxALTO[cm]> [-o archivo.pdf]

EJEMPLOS
  quilmes-corrugados cotizar 400x600x600 3000        # medidas en mm
  quilmes-corrugados cotizar 40x60x60cm 3000         # o en cm, con el sufijo
  quilmes-corrugados cotizar 400x600x600 3000 --colores 2 --json
  quilmes-corrugados precios                         # escalera de precios vigente
  quilmes-corrugados plantilla 400x300x300           # PDF del troquel para el diseño

OPCIONES
  --colores N     colores de impresión flexográfica (0-3)
  --json          imprime la respuesta cruda de la API (para scripts y agentes)
  -o ARCHIVO      dónde guardar el PDF de la plantilla
  --api-key KEY   API key para rate limit extendido (o env QUILMES_API_KEY)
  --version       versión del CLI
  --help          esta ayuda

Sin API key el límite es 10 consultas por minuto. El precio es el real de
fábrica, el mismo que ve un cliente en ${BASE}.
Más recursos: ${BASE}/developers`;

function salirConAyuda(mensaje) {
  if (mensaje) console.error(`Error: ${mensaje}\n`);
  console.error(AYUDA);
  process.exit(1);
}

/** "400x600x600" o "40x60x60cm" (x, X, *, ×) → medidas en mm. */
function parsearMedidas(texto) {
  const m = /^(\d+(?:[.,]\d+)?)[xX*×](\d+(?:[.,]\d+)?)[xX*×](\d+(?:[.,]\d+)?)(cm)?$/.exec((texto || '').trim());
  if (!m) return null;
  const factor = m[4] ? 10 : 1;
  const num = (s) => Math.round(parseFloat(s.replace(',', '.')) * factor);
  return { largo: num(m[1]), ancho: num(m[2]), alto: num(m[3]) };
}

function versionDelPaquete() {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function cabeceras(apiKey) {
  const h = { 'User-Agent': `quilmes-corrugados-cli/${versionDelPaquete()}` };
  const key = apiKey || process.env.QUILMES_API_KEY;
  if (key) h['X-API-Key'] = key;
  return h;
}

/** Separa flags conocidos de los argumentos posicionales. */
function parsearArgs(argv) {
  const posicionales = [];
  const flags = { json: false, colores: 0, salida: null, apiKey: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--colores') flags.colores = parseInt(argv[++i], 10);
    else if (a === '-o' || a === '--salida') flags.salida = argv[++i];
    else if (a === '--api-key') flags.apiKey = argv[++i];
    else if (a === '--help' || a === '-h' || a === 'ayuda') salirConAyuda();
    else if (a === '--version' || a === '-v') { console.log(versionDelPaquete()); process.exit(0); }
    else if (a.startsWith('-')) salirConAyuda(`opción desconocida: ${a}`);
    else posicionales.push(a);
  }
  return { posicionales, flags };
}

async function cotizar(posicionales, flags) {
  const medidas = parsearMedidas(posicionales[0]);
  const cantidad = parseInt(posicionales[1], 10);
  if (!medidas) salirConAyuda('las medidas van como LARGOxANCHOxALTO en mm (o con sufijo cm): 400x600x600');
  if (!Number.isInteger(cantidad) || cantidad < 1) salirConAyuda('la cantidad tiene que ser un entero mayor a cero');
  if (Number.isNaN(flags.colores) || flags.colores < 0 || flags.colores > 3) {
    salirConAyuda('--colores va de 0 a 3');
  }

  const url = new URL(`${BASE}/api/v1/quote`);
  url.searchParams.set('length_mm', String(medidas.largo));
  url.searchParams.set('width_mm', String(medidas.ancho));
  url.searchParams.set('height_mm', String(medidas.alto));
  url.searchParams.set('quantity', String(cantidad));
  if (flags.colores > 0) url.searchParams.set('printing_colors', String(flags.colores));

  const res = await fetch(url, { headers: cabeceras(flags.apiKey) });
  const datos = await res.json();

  if (flags.json) {
    console.log(JSON.stringify(datos, null, 2));
    process.exit(datos?.quote?.cotizable === false ? 2 : datos.success ? 0 : 1);
  }

  if (!res.ok || !datos.success) {
    console.error(datos.error || `La API respondió ${res.status}`);
    if (datos.errors) for (const e of datos.errors) console.error(`- ${e}`);
    process.exit(1);
  }

  const q = datos.quote;
  console.log(q.summary);
  if (q.cotizable === false) {
    // El resumen ya explica el motivo; las alternativas van aparte porque son
    // lo accionable.
    const alternativas = q.impedimento?.alternativas || [];
    if (alternativas.length) {
      console.log('\nDel catálogo, ya cotizadas al mínimo:');
      for (const a of alternativas) {
        console.log(`- ${a.length_mm}x${a.width_mm}x${a.height_mm} mm — ${a.cantidad.toLocaleString('es-AR')} cajas a $${Math.round(a.precio_por_caja).toLocaleString('es-AR')} c/u`);
      }
    }
    process.exit(2);
  }

  if (flags.colores > 0 && q.printing?.available === false) {
    console.log(`\n${q.printing.price_note}`);
  }
  const sufijo = flags.colores > 0 ? `-${flags.colores}` : '';
  console.log(`\nVer y compartir: ${BASE}/cotizar/${medidas.largo}x${medidas.ancho}x${medidas.alto}/${cantidad}${sufijo}`);
}

async function precios(flags) {
  // La escalera vigente sale del servidor MCP, que la lee de la misma
  // configuración que factura. tools/call directo: el server es sin estado.
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { ...cabeceras(flags.apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'obtener_condiciones_y_precios', arguments: {} },
    }),
  });
  const datos = await res.json();
  if (flags.json) {
    console.log(JSON.stringify(datos, null, 2));
    process.exit(datos.error ? 1 : 0);
  }
  const texto = datos?.result?.content?.find((c) => c.type === 'text')?.text;
  if (!texto) {
    console.error(datos?.error?.message || 'No se pudieron leer los precios.');
    process.exit(1);
  }
  console.log(texto);
}

async function plantilla(posicionales, flags) {
  const medidas = parsearMedidas(posicionales[0]);
  if (!medidas) salirConAyuda('las medidas van como LARGOxANCHOxALTO en mm (o con sufijo cm): 400x300x300');

  const url = `${BASE}/api/box-template?length=${medidas.largo}&width=${medidas.ancho}&height=${medidas.alto}`;
  const res = await fetch(url, { headers: cabeceras(flags.apiKey) });

  if (!res.ok || !(res.headers.get('content-type') || '').includes('application/pdf')) {
    let motivo = `la API respondió ${res.status}`;
    try {
      motivo = (await res.json()).error || motivo;
    } catch { /* el cuerpo no era JSON */ }
    console.error(`No se pudo generar la plantilla: ${motivo}`);
    process.exit(1);
  }

  const destino = resolve(flags.salida || `plantilla-${medidas.largo}x${medidas.ancho}x${medidas.alto}.pdf`);
  writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  console.log(`Plantilla guardada en ${destino}`);
  console.log('Las áreas verdes marcan dónde va el diseño. Se manda el arte a ventas@quilmescorrugados.com.ar o por WhatsApp.');
}

const [comando, ...resto] = process.argv.slice(2);
const { posicionales, flags } = parsearArgs(resto);

try {
  if (comando === 'cotizar') await cotizar(posicionales, flags);
  else if (comando === 'precios') await precios(flags);
  else if (comando === 'plantilla') await plantilla(posicionales, flags);
  else if (comando === '--version' || comando === '-v') console.log(versionDelPaquete());
  else if (!comando || comando === '--help' || comando === '-h' || comando === 'ayuda') salirConAyuda();
  else salirConAyuda(`comando desconocido: ${comando}`);
} catch (err) {
  console.error(`Error de red o de la API: ${err?.message || err}`);
  process.exit(1);
}
