/**
 * El sitemap no le pide a Google que indexe paginas que dicen "no".
 *
 * POR QUE
 *
 * Search Console mostro 11 URLs "descubiertas, actualmente sin indexar". Al
 * abrir una por una, tres de las ocho cotizaciones de ejemplo habian dejado de
 * dar precio:
 *
 *   /cotizar/400x300x300/500    435 m², y el minimo del pedido paso a 500
 *   /cotizar/300x200x150/1000   367,5 m², lo mismo
 *   /cotizar/320x320x50/5000    el alto minimo paso de 50 a 100 mm
 *
 * Ninguna cambio en el codigo: cambio la configuracion de precios, que vive en
 * la base. Los ejemplos estaban escritos a mano y se pudrieron solos.
 *
 * Y cuando no hay precio, la pagina se declara `robots: noindex`. O sea que el
 * sitemap pedia indexar tres URLs que contestan que no se indexen. Ademas
 * habia dos URLs distintas —/2000 y /2000-2— que renderizaban exactamente la
 * misma pagina, con el mismo <title>.
 *
 * Esto corre el motor de verdad y compara contra el sitio publicado.
 *
 *   npx tsx scripts/qa-sitemap.mts [https://dominio]
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const BASE = (process.argv[2] || 'https://www.quilmescorrugados.com.ar').replace(/\/+$/, '');

const { EJEMPLOS, rutaEjemplo } = await import('@/lib/cotizacion/ejemplos');
const { calcularCotizacion } = await import('@/lib/cotizacion/motor');
const { createAdminClient } = await import('@/lib/supabase/admin');
const sitemap = (await import('@/app/sitemap')).default;

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

// La misma lectura que hace la pagina: si aca se consulta otra tabla, la QA
// verifica algo distinto de lo que el visitante ve.
const db = createAdminClient();
const { data: config } = await db
  .from('pricing_config')
  .select('*')
  .eq('is_active', true)
  .order('valid_from', { ascending: false })
  .limit(1)
  .single();
const { data: catalogo } = await db
  .from('boxes')
  .select('length_mm, width_mm, height_mm, stock')
  .eq('is_standard', true)
  .eq('is_active', true);

console.log('');
console.log('Cada ejemplo del sitemap da un precio');
if (!config) {
  console.log('  FALLA no se pudo leer pricing_config');
  process.exit(1);
}
for (const e of EJEMPLOS) {
  const q = calcularCotizacion(
    [{
      length_mm: e.mm.largo, width_mm: e.mm.ancho, height_mm: e.mm.alto,
      quantity: e.unidades, printing_colors: e.colores, has_printing: e.colores > 0,
    }],
    config as never,
    catalogo || [],
  );
  const motivo = q.cotizable
    ? ''
    : q.impedimento.tipo === 'no_fabricable'
      ? 'no se fabrica'
      : `necesita ${q.impedimento.cajas_necesarias} cajas y el ejemplo pide ${e.unidades}`;
  ok(rutaEjemplo(e), q.cotizable, motivo);
}

console.log('');
console.log('Sin duplicados');
{
  const rutas = EJEMPLOS.map(rutaEjemplo);
  const repetidas = rutas.filter((r, i) => rutas.indexOf(r) !== i);
  ok('ninguna ruta repetida', repetidas.length === 0, repetidas.join(', '));

  // Dos ejemplos con la misma medida y la misma cantidad renderizan la misma
  // pagina aunque la URL sea distinta: fue el caso de /2000 y /2000-2.
  const firmas = EJEMPLOS.map((e) => `${e.mm.largo}x${e.mm.ancho}x${e.mm.alto}/${e.unidades}/${e.colores}`);
  const iguales = firmas.filter((f, i) => firmas.indexOf(f) !== i);
  ok('ningun ejemplo renderiza lo mismo que otro', iguales.length === 0, iguales.join(', '));
}

console.log('');
console.log('El sitemap solo publica lo verificado');
const entradas = await sitemap();
const urls = entradas.map((e) => String(e.url));
{
  const cotizar = urls.filter((u) => u.includes('/cotizar/'));
  ok('publica una cotizacion por ejemplo', cotizar.length === EJEMPLOS.length,
     `${cotizar.length} en el sitemap, ${EJEMPLOS.length} ejemplos`);
  ok('no hay URLs repetidas', new Set(urls).size === urls.length);
  ok('todas absolutas y en https', urls.every((u) => u.startsWith('https://')));
}

console.log('');
console.log(`Contra el sitio publicado — ${BASE}`);
const titulos = new Map<string, string>();
for (const u of urls) {
  const ruta = u.replace(BASE, '') || '/';
  const res = await fetch(u).catch(() => null);
  if (!res || res.status !== 200) {
    ok(`${ruta} responde`, false, `${res?.status ?? 'sin respuesta'}`);
    continue;
  }
  const html = await res.text();
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  const titulo = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();

  // Esta es la contradiccion que hay que impedir: el sitemap dice "indexá" y la
  // pagina contesta "no me indexes".
  if (noindex) {
    ok(`${ruta} no se declara noindex`, false, 'esta en el sitemap y pide no ser indexada');
  } else {
    ok(`${ruta}`, true);
  }

  const antes = titulos.get(titulo);
  if (antes) {
    fallos++;
    console.log(`  FALLA ${ruta} tiene el mismo <title> que ${antes}\n        "${titulo}"`);
  }
  titulos.set(titulo, ruta);
}

console.log('');
console.log('Googlebot puede dibujar la pagina');
{
  const robots = await fetch(`${BASE}/robots.txt`).then((r) => r.text()).catch(() => '');
  ok('deja leer /_next/static/', /Allow:\s*\/_next\/static\//.test(robots),
     'sin el CSS y el JS, Googlebot renderiza una pagina distinta de la que ve una persona');
  ok('sigue cerrando el panel', /Disallow:\s*\/dashboard\//.test(robots));
  ok('sigue cerrando el login', /Disallow:\s*\/login/.test(robots));
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
