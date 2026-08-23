/**
 * La impresion se ofrece sola, y el PDF del desplegado sale adjunto.
 *
 * POR QUE
 *
 * De las dos mitades, una no existia y la otra casi no se disparaba.
 *
 * Ofrecerla no existia: cotizar_cajas devolvia algo sobre impresion solo cuando
 * la persona YA habia pedido impresion. O sea que se enteraba de que imprimimos
 * quien ya sabia que imprimimos. El resto cotizaba liso y nadie se lo mencionaba
 * nunca. Un servicio que no se ofrece no se vende.
 *
 * Y el adjunto salia de buscar la URL del PDF en el texto de la respuesta: si el
 * agente pegaba el link, salia; si contaba lo mismo con palabras —que es justo
 * lo que le pide la instruccion del canal de WhatsApp— no salia nada. El adjunto
 * dependia de una torpeza de redaccion.
 *
 * Los dos ultimos bloques hablan con el modelo de verdad. Son dos turnos y
 * cuestan centavos, pero son los unicos que prueban lo que ve el cliente.
 *
 *   npx tsx scripts/qa-impresion.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { crearHerramientas } = await import('@/lib/agente/herramientas');
const { transporteMeta } = await import('@/lib/whatsapp-transporte/meta');
const { responder } = await import('@/lib/agente');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
const herramientas = crearHerramientas({ canal: 'whatsapp', telefono: '+5491100000000' }) as Tool[];
const buscar = (n: string) => herramientas.find((t) => t.name === n)!;

async function cotizar(cantidad: number, colores: number) {
  return JSON.parse(await buscar('cotizar_cajas').run({
    largo_mm: 400, ancho_mm: 300, alto_mm: 300, cantidad, colores_impresion: colores,
  }));
}

console.log('');
console.log('Pedido grande y sin impresion pedida: hay que PREGUNTARLE');
{
  const r = await cotizar(2000, 0);
  ok('cotiza', r.se_puede_cotizar === true, JSON.stringify(r).slice(0, 200));
  ok('pasa los 1.000 m2', r.metros_cuadrados >= 1000, `${r.metros_cuadrados} m2`);
  ok('impresion viene resuelta', !!r.impresion, JSON.stringify(r.impresion));
  ok('dice que no lleva', r.impresion?.lleva === false);
  ok('dice que se puede', r.impresion?.se_puede === true);
  ok('le manda preguntar', /PREGUNTASELO/.test(r.impresion?.que_hacer || ''), r.impresion?.que_hacer);
  ok('le pide que sea en el mismo mensaje del precio',
     /mismo mensaje del precio/.test(r.impresion?.que_hacer || ''));
  ok('le prohibe anticipar un recargo', /no anticipes/i.test(r.impresion?.que_hacer || ''));
}

console.log('');
console.log('Pedido que no llega al minimo de impresion: NO se ofrece');
{
  const r = await cotizar(800, 0);
  ok('cotiza igual', r.se_puede_cotizar === true, JSON.stringify(r).slice(0, 200));
  ok('no llega a 1.000 m2', r.metros_cuadrados < 1000, `${r.metros_cuadrados} m2`);
  ok('dice que no se puede', r.impresion?.se_puede === false);
  ok('trae el motivo escrito', /1\.000/.test(r.impresion?.por_que || ''), r.impresion?.por_que);
  ok('le prohibe ofrecerla', /no lo ofrezcas/i.test(r.impresion?.que_hacer || ''),
     r.impresion?.que_hacer);
  ok('no le manda preguntar nada', !/PREGUNTASELO/.test(r.impresion?.que_hacer || ''));
}

console.log('');
console.log('Pedido con impresion: la plantilla viene en la respuesta');
{
  const r = await cotizar(2000, 2);
  ok('dice que lleva', r.impresion?.lleva === true);
  ok('trae el PDF de esta medida',
     /box-template\?length=400&width=300&height=300/.test(r.impresion?.plantilla_pdf || ''),
     r.impresion?.plantilla_pdf);
  ok('le manda llamar a plantilla_impresion',
     /plantilla_impresion/.test(r.impresion?.que_hacer || ''), r.impresion?.que_hacer);
  ok('sigue avisando del polimero', /pol[ií]mero/.test(r.impresion?.que_hacer || ''));

  const url = String(r.impresion.plantilla_pdf);
  if (/localhost|127\.0\.0\.1/.test(url)) {
    console.log(`  ·    el PDF apunta a ${url}: no se puede verificar desde aca`);
  } else {
    const res = await fetch(url).catch(() => null);
    ok('el PDF existe de verdad', res?.status === 200, `${url} -> ${res?.status}`);
    ok('y es un PDF', /application\/pdf/.test(res?.headers.get('content-type') || ''),
       res?.headers.get('content-type') || 'sin content-type');
  }
}

console.log('');
console.log('El adjunto le llega con la medida en el nombre');
{
  const original = globalThis.fetch;
  let enviado: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: unknown, init: { body?: string }) => {
    enviado = JSON.parse(init?.body || '{}');
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    await transporteMeta.enviarDocumento(
      '+5491100000000',
      'https://www.quilmescorrugados.com.ar/api/box-template?length=400&width=300&height=300',
    );
    const doc = enviado.document as { filename?: string; link?: string } | undefined;
    ok('el nombre lleva la medida', doc?.filename === 'plantilla-caja-400x300x300.pdf', doc?.filename);
    ok('y el link es el mismo', /length=400/.test(doc?.link || ''), doc?.link);

    await transporteMeta.enviarDocumento('+5491100000000', 'https://ejemplo.com/otra-cosa.pdf');
    const otro = enviado.document as { filename?: string } | undefined;
    ok('una URL sin medidas cae al nombre generico',
       otro?.filename === 'plantilla-quilmes-corrugados.pdf', otro?.filename);
  } finally {
    globalThis.fetch = original;
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('');
  console.log('  ·    sin ANTHROPIC_API_KEY los dos turnos contra el modelo no se corren');
} else {
  console.log('');
  console.log('Contra el modelo: cotiza 2.000 cajas sin decir nada de impresion');
  {
    const r = await responder('hola, necesito 2000 cajas de 40x30x30', [], {
      canal: 'whatsapp', telefono: '+5491100000000',
    });
    ok('cotiza', r.herramientasUsadas.includes('cotizar_cajas'), r.herramientasUsadas.join(', '));
    ok('LE PREGUNTA POR LA IMPRESION', /impres/i.test(r.texto), r.texto);
    ok('todavia no manda ninguna plantilla', r.plantillas.length === 0, r.plantillas.join(' '));
  }

  console.log('');
  console.log('Contra el modelo: dice que si, y el PDF sale adjunto');
  {
    const r = await responder('si, va impresa, dos colores', [
      { role: 'user', content: 'hola, necesito 2000 cajas de 40x30x30' },
      {
        role: 'assistant',
        content:
          'Son 2.000 cajas de 400x300x300 mm, total con IVA $1.234.567, 10 dias habiles. ' +
          'Una cosa mas: ¿van lisas o con impresion?',
      },
    ], { canal: 'whatsapp', telefono: '+5491100000000' });
    ok('llama a plantilla_impresion', r.herramientasUsadas.includes('plantilla_impresion'),
       r.herramientasUsadas.join(', '));
    ok('EL PDF SALE ADJUNTO', r.plantillas.length > 0, r.texto);
    ok('el PDF es el de la medida pedida',
       /length=400&width=300&height=300/.test(r.plantillas[0] || ''), r.plantillas.join(' '));
    ok('y no le pega la URL en el texto', !/box-template/.test(r.texto), r.texto);
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
