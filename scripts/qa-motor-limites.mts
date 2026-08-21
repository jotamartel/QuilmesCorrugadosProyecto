/**
 * Los límites de fabricación, verificados donde importa: en el motor.
 *
 * POR QUÉ EXISTE
 *
 * validarCajas() tenía estos límites y funcionaba, pero la llamaba quien se
 * acordaba. El MCP y la API pública se acordaban; la herramienta del agente
 * —la que atiende WhatsApp y el chat del sitio— no. Resultado: 500 cajas de
 * 900x800x700 salían cotizadas en $2.587.500, por una caja que no entra en el
 * rollo de cartón. A 50 cajas parecía manejado, pero se rechazaba por volumen,
 * de casualidad: subiendo la cantidad salía el precio.
 *
 * Ahora la regla vive en calcularCotizacion(), así que esto prueba el motor y
 * no cada camino que llega hasta él.
 *
 *   npx tsx scripts/qa-motor-limites.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { calcularCotizacion } = await import('@/lib/cotizacion/motor');
const { getActivePricingConfig } = await import('@/lib/utils/pricing');
const { createAdminClient } = await import('@/lib/supabase/admin');

const config = await getActivePricingConfig();
const { data: catalogo } = await createAdminClient()
  .from('boxes')
  .select('length_mm, width_mm, height_mm, stock')
  .eq('is_standard', true)
  .eq('is_active', true);

let fallos = 0;

function cotizar(l: number, w: number, h: number, q: number, colores = 0) {
  return calcularCotizacion(
    [{ length_mm: l, width_mm: w, height_mm: h, quantity: q, printing_colors: colores }],
    config,
    catalogo || [],
  );
}

function seNiega(nombre: string, l: number, w: number, h: number, q: number, contiene: string) {
  const r = cotizar(l, w, h, q);
  if (r.cotizable) {
    fallos++;
    console.log(`  FALLA ${nombre}: cotizó $${r.subtotal.toLocaleString('es-AR')} y no debería`);
    return;
  }
  if (r.impedimento.tipo !== 'no_fabricable') {
    fallos++;
    console.log(`  FALLA ${nombre}: se negó por "${r.impedimento.tipo}", no por no_fabricable`);
    return;
  }
  if (!r.impedimento.motivo.includes(contiene)) {
    fallos++;
    console.log(`  FALLA ${nombre}: el motivo no menciona "${contiene}"`);
    console.log(`        ${r.impedimento.motivo}`);
    return;
  }
  console.log(`  ok   ${nombre}`);
}

function cotiza(nombre: string, l: number, w: number, h: number, q: number) {
  const r = cotizar(l, w, h, q);
  if (!r.cotizable) {
    fallos++;
    console.log(`  FALLA ${nombre}: se negó — ${r.impedimento.motivo.slice(0, 120)}`);
    return;
  }
  console.log(`  ok   ${nombre} — $${r.subtotal.toLocaleString('es-AR')}`);
}

console.log('');
console.log('No se fabrica, y no hay cantidad que lo arregle');
// El caso que estaba roto: a 50 cajas se rechazaba por volumen, de casualidad.
// A 500 salía el precio.
seNiega('900x800x700 x50', 900, 800, 700, 50, 'plancha');
seNiega('900x800x700 x500', 900, 800, 700, 500, 'plancha');
seNiega('900x800x700 x50.000', 900, 800, 700, 50_000, 'plancha');
seNiega('400x700x700 (el que cotizó el MCP)', 400, 700, 700, 5_000, 'plancha');
seNiega('más chica que el mínimo', 100, 100, 50, 50_000, 'más chica');
seNiega('más grande que el máximo', 2500, 900, 400, 500, 'más grande');

console.log('');
console.log('El límite es exacto');
cotiza('ancho+alto = 1200 justo', 600, 800, 400, 600);
seNiega('ancho+alto = 1201', 600, 801, 400, 600, '1201');

console.log('');
console.log('Cuando se pasa de dos cosas, se dicen las dos');
{
  const r = cotizar(2500, 900, 400, 500);
  if (r.cotizable || r.impedimento.tipo !== 'no_fabricable') {
    fallos++;
    console.log('  FALLA: debería negarse por no_fabricable');
  } else {
    const m = r.impedimento.motivo;
    const dosMotivos = m.includes('plancha') && m.includes('más grande');
    // Y NO debería decir "bajando el ancho o el alto entra": para esta caja es
    // mentira, también se pasa del largo máximo. La bajaría, la volvería a
    // pedir, y se la rechazaríamos de nuevo por otra cosa.
    const noPromete = !m.includes('Bajando el ancho o el alto entra');
    if (dosMotivos && noPromete) {
      console.log('  ok   dice los dos motivos y no promete de más');
    } else {
      fallos++;
      console.log(`  FALLA: dosMotivos=${dosMotivos} noPromete=${noPromete}`);
      console.log(`        ${m}`);
    }
  }
}

console.log('');
console.log('Lo que sí se fabrica sigue cotizando');
cotiza('1500x 400x300x300', 400, 300, 300, 1500);
cotiza('2600x 300x380x420', 300, 380, 420, 2600);
cotiza('500x 600x400x400 (catálogo)', 600, 400, 400, 500);

console.log('');
console.log('Y sigue ofreciendo alternativas de catálogo en vez de derivar');
{
  const r = cotizar(900, 800, 700, 500);
  if (!r.cotizable && r.impedimento.alternativas.length >= 2) {
    console.log(`  ok   ${r.impedimento.alternativas.length} alternativas`);
  } else {
    fallos++;
    console.log('  FALLA: sin alternativas');
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
