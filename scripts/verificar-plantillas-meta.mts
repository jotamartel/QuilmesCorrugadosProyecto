/**
 * Compara las plantillas que hay en Meta contra las que el código va a usar.
 *
 * POR QUE
 *
 * El envío busca la plantilla por NOMBRE e IDIOMA. Si en Meta quedó
 * "pedido_en_producción" con acento, o el idioma se cargó como "es" en vez de
 * "es_AR", el envío falla en producción con un error que no dice cuál es el
 * problema — y se descubre el día que un cliente no recibe el aviso.
 *
 * Ese es exactamente el modo de falla que este script ataja: se corre DESPUÉS
 * de cargar las plantillas y ANTES de enchufar el motor de avisos.
 *
 * COMPARA CONTRA EL CÓDIGO, NO CONTRA UNA COPIA. Un script anterior tenía su
 * propia transcripción del texto y reportó una diferencia que no existía. La
 * única fuente es src/lib/whatsapp-plantillas.ts.
 *
 *   npx tsx scripts/verificar-plantillas-meta.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { PLANTILLAS } = await import('@/lib/whatsapp-plantillas');
const { VERSION_DE_GRAPH } = await import('@/lib/whatsapp-transporte/meta');

const TOKEN = process.env.META_WA_TOKEN;
const WABA = process.env.META_WA_WABA_ID;

if (!TOKEN || !WABA) {
  console.log('\nFaltan META_WA_TOKEN o META_WA_WABA_ID.');
  console.log('Bajalas con: npx vercel env pull .env.qa.tmp --environment=production\n');
  process.exit(1);
}

interface Componente {
  type: string;
  text?: string;
  buttons?: Array<{ type: string; text?: string; url?: string }>;
}
interface PlantillaEnMeta {
  name: string;
  status: string;
  language: string;
  category: string;
  components?: Componente[];
}

const url =
  `https://graph.facebook.com/${VERSION_DE_GRAPH}/${WABA}/message_templates` +
  `?fields=name,status,language,category,components&limit=100`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
const datos = await res.json();

if (!res.ok) {
  console.log('\nNo se pudieron listar las plantillas:');
  console.log(`  ${datos?.error?.message ?? JSON.stringify(datos)}\n`);
  process.exit(1);
}

const enMeta: PlantillaEnMeta[] = datos.data ?? [];
let fallos = 0;
let pendientes = 0;

function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

console.log('');
console.log(`En la cuenta hay ${enMeta.length} plantilla(s):`);
for (const p of enMeta) {
  const marca = p.status === 'APPROVED' ? '✓' : p.status === 'REJECTED' ? '✗' : '·';
  console.log(`  ${marca} ${p.name.padEnd(28)} ${p.language.padEnd(7)} ${p.status.padEnd(10)} ${p.category}`);
}

console.log('');
console.log('Cada plantilla del código, contra la que está en Meta');

for (const local of PLANTILLAS) {
  const remota = enMeta.find((p) => p.name === local.nombre && p.language === local.idioma);

  if (!remota) {
    // El caso más peligroso: existe con OTRO nombre o idioma. Se dice cuál,
    // porque "no está" y "está mal escrita" se arreglan distinto.
    const parecida = enMeta.find(
      (p) => p.name === local.nombre || p.name.replace(/[^a-z_]/g, '') === local.nombre,
    );
    fallos++;
    console.log(`  FALLA ${local.nombre} (${local.idioma}) no está en Meta`);
    if (parecida) {
      console.log(`        hay una parecida: "${parecida.name}" en ${parecida.language}`);
      console.log(`        el envío busca por nombre + idioma EXACTOS, así que no la va a encontrar`);
    }
    continue;
  }

  if (remota.status !== 'APPROVED') {
    pendientes++;
    console.log(`  ·    ${local.nombre}: ${remota.status} — todavía no se puede enviar`);
  } else {
    console.log(`  ok   ${local.nombre}: aprobada`);
  }

  ok(`${local.nombre}: categoría UTILITY`, remota.category === 'UTILITY',
     `en Meta es ${remota.category} — MARKETING cuesta más y el cliente lo puede tener bloqueado`);

  const cuerpo = remota.components?.find((c) => c.type === 'BODY')?.text ?? '';
  const varsEnMeta = new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  ok(`${local.nombre}: ${local.variables} variables en el cuerpo`,
     varsEnMeta.size === local.variables,
     `en Meta hay ${varsEnMeta.size}. El envío manda ${local.variables} valores: si no coinciden, Meta rechaza`);

  const botones = remota.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
  if (local.botonUrl) {
    const botonUrl = botones.find((b) => b.type === 'URL');
    ok(`${local.nombre}: tiene botón de URL`, !!botonUrl,
       botones.length ? `los botones son: ${botones.map((b) => b.type).join(', ')}` : 'no tiene botones');
    if (botonUrl) {
      // El envío manda el parámetro con index '0': el botón de URL tiene que
      // ser el PRIMERO de la lista.
      ok(`${local.nombre}: el botón de URL es el primero`, botones[0]?.type === 'URL',
         `es el número ${botones.findIndex((b) => b.type === 'URL') + 1}`);
      ok(`${local.nombre}: la URL termina con la variable`,
         (botonUrl.url ?? '').endsWith('{{1}}'), botonUrl.url);
      ok(`${local.nombre}: la URL apunta a ${local.botonUrl.base}`,
         (botonUrl.url ?? '').startsWith(local.botonUrl.base), botonUrl.url);
      if (botonUrl.text !== local.botonUrl.texto) {
        // No es una falla: el texto no viaja en el envío, queda congelado en la
        // plantilla. Pero el código debe decir la verdad.
        console.log(`  ·    ${local.nombre}: el botón dice "${botonUrl.text}" y el código "${local.botonUrl.texto}"`);
        console.log(`        no rompe nada (el texto no se envía), pero conviene alinearlo`);
      }
    }
  } else {
    ok(`${local.nombre}: sin botón, como en el código`, botones.length === 0);
  }
}

console.log('');
if (fallos > 0) {
  console.log(`${fallos} problema(s): hasta arreglarlos, esos avisos no van a salir.`);
} else if (pendientes > 0) {
  console.log(`Todo bien, pero ${pendientes} sigue(n) esperando aprobación de Meta.`);
  console.log('El motor de avisos se puede desplegar igual: los que no estén aprobados');
  console.log('quedan registrados como error y se reintentan cuando aprueben.');
} else {
  console.log('Todo bien: las plantillas de Meta y las del código coinciden.');
}
console.log('');
process.exit(fallos === 0 ? 0 : 1);
