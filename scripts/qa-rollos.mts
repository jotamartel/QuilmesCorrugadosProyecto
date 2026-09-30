/**
 * Rollos de cartón corrugado: el bot los cotiza con los precios del panel.
 *
 * POR QUE
 *
 * En septiembre de 2026 el bot contestó "no tengo la certeza de si vendemos
 * rollos" a clientes que pedían 30 y 40 rollos por semana. Ver src/lib/rollos.ts
 * y la migración 044.
 *
 *   npx tsx scripts/qa-rollos.mts            (solo la herramienta)
 *   npx tsx scripts/qa-rollos.mts --agente   (además, dos turnos reales del modelo)
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true, quiet: true }); break; }
}

const { crearHerramientas } = await import('@/lib/agente/herramientas');
const { leerRollos } = await import('@/lib/rollos');

let fallos = 0;
const ok = (t: string, c: boolean, d = '') => {
  if (c) console.log(`  ok   ${t}`);
  else { fallos++; console.log(`  FALLA ${t}${d ? `\n        ${d}` : ''}`); }
};

type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
const tool = (crearHerramientas({ canal: 'web', yaTenemosContacto: true }) as Tool[])
  .find((t) => t.name === 'precios_de_rollos')!;
const rollos = await leerRollos();
const r120x25 = rollos.find((r) => r.ancho_m === 1.2 && r.largo_m === 25)!;

console.log('\nSin datos: la lista');
{
  const r = JSON.parse(await tool.run({}));
  ok('devuelve las medidas activas', r.medidas_disponibles?.length === rollos.length, JSON.stringify(r).slice(0, 200));
}

console.log('\n1,20 x 25 m');
{
  const pocos = JSON.parse(await tool.run({ ancho: 1.2, largo_m: 25, cantidad: 50 }));
  ok('50 rollos al precio por rollo', pocos.precio_por_rollo === r120x25.precio_unitario && !pocos.es_precio_mayorista,
    JSON.stringify(pocos).slice(0, 200));
  ok('total con IVA', pocos.total_con_iva === Math.round(r120x25.precio_unitario * 50 * 1.21 * 100) / 100);
  ok('avisa del mayorista porque está cerca', /desde 100 rollos/.test(pocos.instruccion), pocos.instruccion);
  const muchos = JSON.parse(await tool.run({ ancho: 120, largo_m: 25, cantidad: 120 }));
  ok('120 rollos (ancho en cm) al mayorista', muchos.es_precio_mayorista && muchos.precio_por_rollo === r120x25.precio_mayorista,
    JSON.stringify(muchos).slice(0, 200));
}

console.log('\nAmbigüedades');
{
  const sinLargo = JSON.parse(await tool.run({ ancho: 1.2, cantidad: 30 }));
  ok('1,20 sin largo, con dos largos posibles, no elige por la persona', sinLargo.hay_precio === false && sinLargo.medidas_disponibles,
    JSON.stringify(sinLargo).slice(0, 200));
  const unoPorUno = JSON.parse(await tool.run({ ancho: 1, cantidad: 40 }));
  ok('1 m sin largo, con una sola medida, la toma', unoPorUno.medida === '1 x 25 m' && unoPorUno.cantidad === 40,
    JSON.stringify(unoPorUno).slice(0, 200));
  const inexistente = JSON.parse(await tool.run({ ancho: 0.8, largo_m: 50, cantidad: 10 }));
  ok('una medida que no existe no inventa precio', inexistente.hay_precio === false);
}

console.log('\nGuardar desde el panel');
{
  const { validarRollos, guardarRollos } = await import('@/lib/rollos');
  ok('rechaza un precio en cero', validarRollos([{ ancho_m: 1, largo_m: 25, precio_unitario: 0 }]).length === 1);
  ok('rechaza mayorista sin cantidad',
    validarRollos([{ ancho_m: 1, largo_m: 25, precio_unitario: 100, precio_mayorista: 90 }]).length === 1);
  ok('rechaza mayorista más caro',
    validarRollos([{ ancho_m: 1, largo_m: 25, precio_unitario: 100, precio_mayorista: 120, mayorista_desde: 10 }]).length === 1);
  ok('rechaza una medida repetida',
    validarRollos([{ ancho_m: 1, largo_m: 25, precio_unitario: 100 }, { ancho_m: 1, largo_m: 25, precio_unitario: 90 }]).length === 1);

  // Agregar una medida y volver a dejar la lista como estaba.
  const antes = await leerRollos(false);
  const comoEstaba = antes.map((r) => ({ ...r }));
  try {
    const conUnaMas = await guardarRollos([...comoEstaba, { ancho_m: 0.5, largo_m: 10, precio_unitario: 1000 }]);
    ok('agrega una medida nueva', conUnaMas.length === antes.length + 1 && conUnaMas.some((r) => r.ancho_m === 0.5));
  } finally {
    const despues = await guardarRollos(comoEstaba);
    ok('y sacarla la borra, sin tocar las otras',
      despues.length === antes.length &&
        despues.every((r, i) => r.id === antes[i].id && r.precio_unitario === antes[i].precio_unitario),
      JSON.stringify(despues.map((r) => [r.ancho_m, r.largo_m, r.precio_unitario])));
  }
}

if (process.argv.includes('--agente')) {
  const { responder } = await import('@/lib/agente');
  console.log('\nEl agente, con mensajes reales del historial');
  const casos: Array<[string, RegExp]> = [
    ['Rollos de carton corrugado 1.20 x 25 para embalaje venden? Quisiera comprar una cantidad de minimo 30 rollos', /\$?\s?15\.750|571\.725|472\.500/],
    ['Hola, necesito 40 rollos de 1x25', /13\.200|528\.000|638\.880/],
  ];
  for (const [mensaje, precio] of casos) {
    const r = await responder(mensaje, [], { canal: 'web', yaTenemosContacto: true });
    ok(`"${mensaje.slice(0, 40)}…" usa la herramienta`, r.herramientasUsadas.includes('precios_de_rollos'), r.herramientasUsadas.join(','));
    ok('y da el precio', precio.test(r.texto), r.texto.slice(0, 300));
    ok('no dice que no sabe si vendemos rollos', !/no (tengo|sé).*(certeza|seguro)/i.test(r.texto));
    console.log(`        "${r.texto.replace(/\n/g, ' ').slice(0, 220)}"`);
  }
}

console.log(fallos ? `\n${fallos} fallas\n` : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
