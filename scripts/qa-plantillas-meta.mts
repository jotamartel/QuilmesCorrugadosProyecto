/**
 * Las plantillas de WhatsApp cumplen las reglas de Meta ANTES de cargarlas.
 *
 * POR QUE
 *
 * Una plantilla es un trámite: se carga a mano en el Administrador de
 * WhatsApp, tarda en aprobarse, y una vez aprobada editarla exige
 * re-aprobación. Cada error que se descubre allá cuesta días. Las reglas que
 * ya nos rebotaron, y que este script no deja volver a romper:
 *
 *   1. Ninguna variable puede ser lo primero ni lo último del cuerpo.
 *      (Rebotó al cargar pedido_confirmado el 23/08/2026.)
 *   2. Meta rechaza el envío ENTERO si una variable llega vacía.
 *   3. La variable de un botón de URL va SOLO al final de la URL.
 *   4. El nombre y el idioma tienen que coincidir EXACTO con los de Meta, o
 *      el envío falla con un error que no dice cuál es el problema.
 *
 * Y una regla de la casa: el número de variables declarado tiene que coincidir
 * con las que hay escritas. Si el contador miente, el envío manda de menos y
 * Meta lo rechaza sin explicar.
 *
 *   npx tsx scripts/qa-plantillas-meta.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { PLANTILLAS } = await import('@/lib/whatsapp-plantillas');
const { transporteMeta } = await import('@/lib/whatsapp-transporte/meta');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

console.log('');
console.log('Todas las plantillas, las reglas que valen para cualquiera');
for (const p of PLANTILLAS) {
  const cuerpo = p.cuerpo.trim();

  ok(`${p.nombre}: no empieza con una variable`, !/^\{\{\d+\}\}/.test(cuerpo), cuerpo.slice(0, 40));
  ok(`${p.nombre}: no termina con una variable`, !/\{\{\d+\}\}$/.test(cuerpo), cuerpo.slice(-40));

  const escritas = new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
  ok(`${p.nombre}: declara ${p.variables} variables y hay ${escritas.size}`, escritas.size === p.variables);

  // {{1}}, {{2}}, {{3}}… sin saltos: Meta numera correlativo y un hueco
  // desalinea todos los valores del envío.
  const esperadas = Array.from({ length: p.variables }, (_, i) => i + 1);
  ok(`${p.nombre}: la numeración va correlativa desde 1`,
     esperadas.every((n) => escritas.has(n)), [...escritas].sort().join(','));

  ok(`${p.nombre}: el idioma es es_AR`, p.idioma === 'es_AR', p.idioma);
  // Meta solo acepta minúsculas, números y guion bajo en el nombre.
  ok(`${p.nombre}: el nombre tiene forma válida`, /^[a-z0-9_]+$/.test(p.nombre));
  ok(`${p.nombre}: entra en los 1024 caracteres del cuerpo`, cuerpo.length <= 1024, String(cuerpo.length));

  // EL FORMATO DE WHATSAPP NO PERDONA UN ESPACIO MAL PUESTO.
  //
  // *texto* pone negrita, pero "* texto*" NO: WhatsApp no abre el formato si
  // hay un espacio pegado al asterisco, y el cliente recibe los asteriscos
  // literales. Pasó al cargar pedido_en_produccion, con
  // "Fecha estimada de entrega:* {{2}}*." — se veía bien en el editor y le
  // habría llegado roto a cada cliente, sin forma de arreglarlo sin
  // re-aprobar la plantilla.
  const asteriscos = (cuerpo.match(/\*/g) ?? []).length;
  ok(`${p.nombre}: los asteriscos vienen en pares`, asteriscos % 2 === 0, String(asteriscos));

  const tramos = [...cuerpo.matchAll(/\*([^*]*)\*/g)].map((m) => m[1]);
  ok(`${p.nombre}: ninguna negrita abre o cierra con espacio`,
     tramos.every((t) => t.length > 0 && t === t.trim()),
     tramos.filter((t) => t !== t.trim() || !t.length).map((t) => `"*${t}*"`).join(' '));
}

console.log('');
console.log('Los seis avisos del pedido');
const delPedido = PLANTILLAS.filter((p) => p.nombre.startsWith('pedido_'));
{
  ok('están las seis', delPedido.length === 6, delPedido.map((p) => p.nombre).join(', '));
  const esperados = [
    'pedido_confirmado', 'pedido_en_produccion', 'pedido_saldo_actualizado',
    'pedido_despachado', 'pedido_entregado', 'pedido_cancelado',
  ];
  ok('con los nombres exactos que se cargan en Meta',
     esperados.every((n) => delPedido.some((p) => p.nombre === n)),
     delPedido.map((p) => p.nombre).join(', '));

  for (const p of delPedido) {
    ok(`${p.nombre}: UTILITY (no MARKETING, que se aprueba con reglas de publicidad)`,
       p.categoria === 'UTILITY', p.categoria);
    ok(`${p.nombre}: lleva el botón de seguimiento`, !!p.botonUrl);
    ok(`${p.nombre}: el link NO quedó también en el cuerpo`,
       !/quilmescorrugados\.com\.ar/.test(p.cuerpo), 'el link duplicado confunde y ocupa lugar');
    ok(`${p.nombre}: el texto del botón entra en 25 caracteres`,
       (p.botonUrl?.texto.length ?? 99) <= 25, p.botonUrl?.texto);
    // La variable va al final de la URL: si la base no termina en /, el token
    // se pega al path y el link no resuelve.
    ok(`${p.nombre}: la URL del botón termina en /pedido/`,
       p.botonUrl?.base.endsWith('/pedido/') === true, p.botonUrl?.base);
    ok(`${p.nombre}: la URL del botón usa https`,
       p.botonUrl?.base.startsWith('https://') === true, p.botonUrl?.base);
  }

  // El path está congelado en Meta: si alguien lo cambia acá, los links de
  // todos los avisos ya aprobados dejan de coincidir con lo que se envía.
  const paths = new Set(delPedido.map((p) => p.botonUrl?.base));
  ok('las seis apuntan al mismo path', paths.size === 1, [...paths].join(' | '));

  // El aviso del saldo no es informativo: la persona va a PAGAR. El botón
  // tiene que decir eso, no "ver mi pedido".
  const saldo = delPedido.find((p) => p.nombre === 'pedido_saldo_actualizado')!;
  ok('el aviso del saldo lleva su propio botón, no el genérico',
     saldo.botonUrl?.texto === 'Datos para transferir', saldo.botonUrl?.texto);
  ok('y el cuerpo manda al botón para copiar el alias',
     /botón de abajo para copiarlo/.test(saldo.cuerpo), saldo.cuerpo);
  ok('el botón no promete copiar, porque navega y no copia',
     !/copiar/i.test(saldo.botonUrl?.texto ?? ''), saldo.botonUrl?.texto);
}

console.log('');
console.log('El botón viaja como componente aparte, y vacío no se manda');
{
  const original = globalThis.fetch;
  let enviado: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: unknown, init: { body?: string }) => {
    enviado = JSON.parse(init?.body || '{}');
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
  }) as unknown as typeof fetch;

  try {
    await transporteMeta.enviarPlantilla!('+5491100000000', {
      nombre: 'pedido_confirmado',
      idioma: 'es_AR',
      variables: ['OC-2026-0004', '1.268.750'],
      variableDeBoton: 'aBcDeFgHiJkLmNoPqRsTuV',
    });
    const comps = (enviado.template as { components?: Array<Record<string, unknown>> })?.components ?? [];
    ok('van dos componentes: cuerpo y botón', comps.length === 2, JSON.stringify(comps));
    ok('el segundo es el botón de url, índice 0',
       comps[1]?.type === 'button' && comps[1]?.sub_type === 'url' && comps[1]?.index === '0',
       JSON.stringify(comps[1]));
    ok('el token viaja como parámetro del botón',
       JSON.stringify(comps[1]?.parameters).includes('aBcDeFgHiJkLmNoPqRsTuV'));
    ok('el cuerpo lleva sus dos valores',
       JSON.stringify(comps[0]?.parameters).includes('OC-2026-0004'));

    const antes = JSON.stringify(enviado);
    const r = await transporteMeta.enviarPlantilla!('+5491100000000', {
      nombre: 'pedido_confirmado', idioma: 'es_AR',
      variables: ['OC-2026-0004', '1.268.750'], variableDeBoton: '   ',
    });
    ok('con la variable del botón vacía NO se llama a Meta',
       r === false && JSON.stringify(enviado) === antes);

    const antes2 = JSON.stringify(enviado);
    const r2 = await transporteMeta.enviarPlantilla!('+5491100000000', {
      nombre: 'pedido_confirmado', idioma: 'es_AR',
      variables: ['OC-2026-0004', ''], variableDeBoton: 'aBcDeFgHiJkLmNoPqRsTuV',
    });
    ok('con una variable del cuerpo vacía tampoco',
       r2 === false && JSON.stringify(enviado) === antes2);

    // La que no lleva botón sigue mandando un solo componente.
    await transporteMeta.enviarPlantilla!('+5491100000000', {
      nombre: 'retomar_conversacion', idioma: 'es_AR', variables: [],
    });
    ok('la plantilla sin variables ni botón no manda components',
       !('components' in (enviado.template as Record<string, unknown>)),
       JSON.stringify(enviado.template));
  } finally {
    globalThis.fetch = original;
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
