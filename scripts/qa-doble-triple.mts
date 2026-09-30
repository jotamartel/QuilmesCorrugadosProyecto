/**
 * El doble triple, contra la config real.
 *
 * POR QUE
 *
 * En septiembre de 2026 el bot cotizaba onda simple a quien pedía doble
 * triple. El caso testigo es Migaplat: 5.000 cajas de 300x300x240 "en doble
 * corrugado". El bot dijo $607,50 por caja; Florencia lo recotizó a mano en
 * doble triple 120 liner a $1.215. Si el motor no da ese número, algo está mal.
 *
 *   npx tsx scripts/qa-doble-triple.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { calcularCotizacion, validarCajas } = await import('@/lib/cotizacion/motor');
const { getActivePricingConfig } = await import('@/lib/utils/pricing');
const { crearHerramientas } = await import('@/lib/agente/herramientas');
const { createAdminClient } = await import('@/lib/supabase/admin');
type Material = import('@/lib/cotizacion/material').Material;

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const config = (await getActivePricingConfig())!;
const { data: catalogo } = await createAdminClient()
  .from('boxes').select('length_mm, width_mm, height_mm, stock')
  .eq('is_standard', true).eq('is_active', true);

const cotizar = (l: number, w: number, h: number, q: number, material: Material, colores = 0) =>
  calcularCotizacion(
    [{ length_mm: l, width_mm: w, height_mm: h, quantity: q, printing_colors: colores, material }],
    config,
    catalogo || [],
  );

console.log(`\nConfig: R130 $${config.price_per_m2_r130}/m², DT120 $${config.price_per_m2_dt120}/m², DT150 $${config.price_per_m2_dt150}/m², mínimo ${config.min_m2_reforzado} m²`);

console.log('\nReforzado 130 libras: la caja de 1000x600x600 para tambores');
{
  // Florencia la cotizó a $5.850 en 130 libras (Ezequiel, tambores de 200 L).
  const q = cotizar(1000, 600, 600, 1000, 'r130');
  ok('se cotiza', q.cotizable);
  if (q.cotizable) {
    const b = q.boxes[0];
    const esperado = 1300 * (b.pieces === 2 ? 1.25 : 1);
    ok('a $1.300 por m² (con el 25% si va en mitades)', b.price_per_m2 === esperado, `${b.price_per_m2} vs ${esperado}`);
    ok('el resumen nombra el 130', q.summary.includes('reforzado 130 libras'), q.summary);
    console.log(`        precio por caja: $${b.unit_price} (Florencia: $5.850)`);
  }
  const poco = cotizar(400, 300, 300, 500, 'r130');
  ok('bajo el mínimo habla del 130, no del doble triple',
    !poco.cotizable && poco.impedimento.motivo.startsWith('El reforzado 130 libras'),
    poco.cotizable ? 'cotizó' : poco.impedimento.motivo);
}

console.log('\nEl caso Migaplat: 5.000 de 300x300x240');
{
  const simple = cotizar(300, 300, 240, 5000, 'simple');
  const dt = cotizar(300, 300, 240, 5000, 'dt120');
  ok('onda simple sigue en $607,50', simple.cotizable && simple.boxes[0].unit_price === 607.5,
    JSON.stringify(simple.cotizable && simple.boxes[0].unit_price));
  ok('dt120 da los $1.215 de Florencia', dt.cotizable && dt.boxes[0].unit_price === 1215,
    JSON.stringify(dt.cotizable && dt.boxes[0].unit_price));
  ok('el resumen nombra el cartón', dt.summary.includes('doble triple 120 liner'), dt.summary);
  ok('el doble triple es producción a medida', dt.channel === 'made_to_order');
  ok('sin escalón que ofrecer', dt.next_tier === null);
  ok('la nota de onda simple ofrece el doble triple', simple.material_note.includes('doble triple'), simple.material_note);
  ok('el mensaje de WhatsApp lleva el cartón', dt.contact.whatsapp_message.includes('doble triple 120 liner'));
}

console.log('\nHernán (Lumma): 700x500x500 en DT150');
{
  const poco = cotizar(700, 500, 500, 250, 'dt150');
  ok('250 cajas no llegan al mínimo', !poco.cotizable && poco.impedimento.tipo === 'bajo_minimo',
    poco.cotizable ? 'cotizó' : poco.impedimento.motivo);
  if (!poco.cotizable) {
    ok('el motivo habla del doble triple', poco.impedimento.motivo.includes('doble triple'), poco.impedimento.motivo);
    ok('no ofrece catálogo de onda simple', poco.impedimento.alternativas.length === 0);
    ok('dice cuántas cajas hacen falta',
      poco.impedimento.tipo !== 'no_fabricable' && (poco.impedimento.cajas_necesarias ?? 0) > 250);
  }
  const bastante = cotizar(700, 500, 500, 1500, 'dt150');
  ok('1.500 cajas se cotizan', bastante.cotizable);
  if (bastante.cotizable) {
    const b = bastante.boxes[0];
    ok('en dos mitades con el 25%', b.pieces === 2 && b.price_per_m2 === 2300 * 1.25, `${b.pieces} ${b.price_per_m2}`);
  }
}

console.log('\nUna medida de catálogo en doble triple no es "de catálogo"');
{
  const q = cotizar(400, 300, 300, 1200, 'dt120');
  ok('se fabrica a pedido, no sale de stock', q.cotizable && q.channel === 'made_to_order' && !q.can_buy_online);
}

console.log('\nSin precio cargado no se cotiza');
{
  const sin = { ...config, price_per_m2_dt150: null };
  const errores = validarCajas(
    [{ length_mm: 400, width_mm: 300, height_mm: 300, quantity: 3000, material: 'dt150' }], sin);
  ok('validarCajas lo rechaza', errores.length === 1 && errores[0].includes('150 kraft'), errores.join(' | '));
  let tiro = false;
  try {
    calcularCotizacion([{ length_mm: 400, width_mm: 300, height_mm: 300, quantity: 3000, material: 'dt150' }], sin);
  } catch { tiro = true; }
  ok('el motor no inventa un precio', tiro);
}

console.log('\nLa herramienta del bot');
{
  type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
  const tools = crearHerramientas({ canal: 'whatsapp', telefono: '+5491100000000', yaTenemosContacto: true }) as Tool[];
  const cotizarCajas = tools.find((t) => t.name === 'cotizar_cajas')!;
  const r = JSON.parse(await cotizarCajas.run({
    largo_mm: 300, ancho_mm: 300, alto_mm: 240, cantidad: 5000, colores_impresion: 0, carton: 'dt120',
  }));
  ok('cotiza en dt120', r.se_puede_cotizar && r.precio_por_caja === '$1.215', r.precio_por_caja);
  ok('el link lleva el cartón', String(r.link_para_compartir).endsWith('?carton=dt120'), r.link_para_compartir);
  ok('trae el material escrito', String(r.material).includes('doble triple 120 liner'));

  const pago = tools.find((t) => t.name === 'condiciones_de_pago')!;
  const p = JSON.parse(await pago.run({
    largo_mm: 300, ancho_mm: 300, alto_mm: 240, cantidad: 5000, colores_impresion: 0, carton: 'dt120',
  }));
  ok('la seña sale del total en doble triple', JSON.stringify(p).includes('3.675.375') || JSON.stringify(p).includes('7.350.750') || JSON.stringify(p).includes('3.037.500'),
    JSON.stringify(p).slice(0, 300));

  const cond = tools.find((t) => t.name === 'condiciones_y_precios')!;
  const c = JSON.parse(await cond.run({}));
  ok('condiciones lista los cuatro cartones', Array.isArray(c.cartones) && c.cartones.length === 4,
    JSON.stringify(c.cartones?.map((x: { carton: string }) => x.carton)));
}

console.log(fallos ? `\n${fallos} fallas\n` : '\nTodo ok\n');
process.exit(fallos ? 1 : 0);
