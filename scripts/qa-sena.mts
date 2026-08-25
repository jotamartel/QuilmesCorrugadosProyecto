/**
 * De cuánto es la seña: que el asistente lo sepa, y que lo sepa igual que el resto.
 *
 * POR QUE
 *
 * El 24/08/2026 un cliente cerró un pedido de 297 cajas por WhatsApp, dio su
 * CUIT y su dirección, recibió el CBU, y preguntó "Seña de cuanto". El
 * asistente contestó que no lo tenía con certeza y derivó al equipo. Todavía
 * está esperando.
 *
 * El número existía en DIEZ lugares del sistema —dos endpoints, cuatro
 * puntos de la facturación de Xubio, una función muerta, la FAQ pública, la
 * página de la cotización y el prompt del respaldo de WhatsApp— y en
 * ninguno estaba escrito de forma que el asistente pudiera leerlo. Alguien
 * leyendo la web sabía más que el que atendía.
 *
 * LAS TRES PROMESAS QUE ESTA QA DEFIENDE
 *
 *   1. Hay UN dueño del porcentaje. Si mañana la seña baja a 40%, cambia en un
 *      archivo y cambia en todos lados. La forma de probarlo no es leer el 50
 *      —eso solo prueba que hoy es 50— sino verificar que cada superficie
 *      DERIVA del mismo valor.
 *   2. La seña se calcula, no se estima. La herramienta devuelve el monto ya
 *      escrito en pesos, y el modelo lo copia. Un porcentaje suelto es una
 *      invitación a multiplicar mal.
 *   3. La seña es cerrada y el saldo NO. Se factura lo entregado y la
 *      producción varía: confundirlos hace que se prometa como exacto un
 *      número que no lo es, o que se dude de uno que sí.
 *
 *   npx tsx scripts/qa-sena.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { SENA_PCT, SENA_SOBRE, repartirElPago, porcentajeAlEntregar, PAGO } =
  await import('@/lib/pagos/esquemas');
const { calcularCotizacion, precioUnitarioARS } = await import('@/lib/cotizacion/motor');
const { getActivePricingConfig } = await import('@/lib/utils/pricing');
const { crearHerramientas } = await import('@/lib/agente/herramientas');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
const herramientas = crearHerramientas({ canal: 'whatsapp', telefono: '+5491100000000' }) as Tool[];
const buscar = (n: string) => herramientas.find((t) => t.name === n)!;

console.log('');
console.log('El reparto: lo que se cobra ahora y lo que queda');
{
  const r = repartirElPago(1000);
  ok('la seña es el porcentaje del total', r.alConfirmar === (1000 * SENA_PCT) / 100, JSON.stringify(r));
  ok('las dos partes suman el total', r.alConfirmar + r.contraEntrega === 1000, JSON.stringify(r));

  // El caso que importa: un total con centavos, que es lo que sale del motor.
  const c = repartirElPago(1213197.18);
  ok('con centavos las dos partes siguen sumando el total',
     Math.round((c.alConfirmar + c.contraEntrega) * 100) / 100 === 1213197.18, JSON.stringify(c));
  ok('y ninguna parte tiene mas de dos decimales',
     Number.isInteger(c.alConfirmar * 100) && Number.isInteger(c.contraEntrega * 100), JSON.stringify(c));

  // Un total impar: 1/2 de 0.01 es 0.005 y el redondeo tiene que cerrar igual.
  const i = repartirElPago(0.01);
  ok('un total de un centavo no se parte en dos medios centavos',
     Math.round((i.alConfirmar + i.contraEntrega) * 100) / 100 === 0.01, JSON.stringify(i));

  ok('el pedido a cuenta corriente no lleva seña',
     repartirElPago(1000, 'credit').alConfirmar === 0 &&
     repartirElPago(1000, 'credit').contraEntrega === 1000);
  ok('y su factura de entrega cubre el total', porcentajeAlEntregar('credit') === 100);
  ok('la del pedido normal cubre lo que quedo', porcentajeAlEntregar('standard') === 100 - SENA_PCT);
}

console.log('');
console.log('Un solo dueño del porcentaje: nadie lo escribe a mano');
{
  // No se afirma que sea 50. Se afirma que cada superficie lo DERIVA, que es
  // lo que sigue siendo cierto el dia que Fernando lo cambie.
  const lee = (f: string) => readFileSync(f, 'utf8');

  const ordenes = lee('src/app/api/orders/route.ts');
  ok('la API de ordenes usa repartirElPago', /repartirElPago\(total\)/.test(ordenes));
  ok('y ya no divide el total a mano', !/\(total \/ 2\)/.test(ordenes));

  const xubio = lee('src/lib/xubio/invoices.ts');
  ok('Xubio importa el porcentaje', /from '@\/lib\/pagos\/esquemas'/.test(xubio));
  ok('Xubio no tiene ningun 50 escrito a mano',
     !/[^\w]50[^\w%]/.test(xubio.replace(/SENA_PCT/g, '')) && !/\? 100 : 50/.test(xubio),
     (xubio.match(/.{0,40}\? 100 : 50.{0,20}|.{0,30}[^\w]50[^\w%].{0,30}/g) || []).join(' | '));

  const convert = lee('src/app/api/quotes/[id]/convert/route.ts');
  ok('convertir cotizacion en pedido usa repartirElPago', /repartirElPago\(quote\.total\)/.test(convert));

  const utils = lee('src/lib/utils/pricing.ts');
  ok('calculatePaymentAmounts ya no existe', !/export function calculatePaymentAmounts/.test(utils));

  const faq = lee('src/app/(public)/faq/page.tsx');
  ok('la FAQ publica sale de PAGO.largo', /answer: PAGO\.largo/.test(faq));
  ok('y no repite el porcentaje en prosa', !/50% de seña/.test(faq));

  const cot = lee('src/app/(public)/cotizacion/[id]/page.tsx');
  ok('la pagina de la cotizacion interpola SENA_PCT', /\{SENA_PCT\}% de seña/.test(cot));

  const respaldo = lee('src/lib/whatsapp-ai.ts');
  ok('el respaldo de WhatsApp deriva de PAGO', /\$\{PAGO\.corto\}/.test(respaldo));
  ok('y no tiene la seña escrita a mano', !/Seña 50%/.test(respaldo));

  // El barrido que sobrevive a que alguien agregue una copia nueva mañana.
  const superficies = [
    'src/app/api/orders/route.ts', 'src/app/api/quotes/[id]/convert/route.ts',
    'src/lib/utils/pricing.ts', 'src/lib/xubio/invoices.ts',
    'src/app/(public)/faq/page.tsx', 'src/app/(public)/cotizacion/[id]/page.tsx',
    'src/lib/whatsapp-ai.ts', 'src/lib/agente/herramientas.ts',
  ];
  const sueltos = superficies.filter((f) =>
    /50% de seña|Seña 50%|total \/ 2|\? 100 : 50/.test(lee(f)));
  ok('ninguna de las diez superficies volvio a escribirlo a mano',
     sueltos.length === 0, sueltos.join(', '));

  // La FAQ es 'use client'. Si esquemas.ts arrastrara Supabase o el SDK de
  // Twilio, el bundle del navegador se rompe — ya paso con el motor.
  const esquemas = lee('src/lib/pagos/esquemas.ts');
  ok('esquemas.ts no importa nada: se puede usar en el cliente',
     !/^import /m.test(esquemas));
}

console.log('');
console.log('La herramienta le da al asistente el monto, no el porcentaje');
{
  const tool = buscar('condiciones_de_pago');
  ok('existe la herramienta', !!tool);

  // El pedido real de la conversacion del 24/08/2026.
  const config = await getActivePricingConfig();
  const q = calcularCotizacion(
    [{ length_mm: 1470, width_mm: 210, height_mm: 780, quantity: 297, printing_colors: 0 }],
    config!,
  );
  const base = SENA_SOBRE === 'neto' ? q.subtotal! : q.total_with_tax!;
  const esperado = repartirElPago(q.cotizable ? base : 0);

  const r = JSON.parse(await tool.run({
    largo_mm: 1470, ancho_mm: 210, alto_mm: 780, cantidad: 297, colores_impresion: 0,
  }));

  ok('con el pedido devuelve monto', r.hay_monto === true, JSON.stringify(r).slice(0, 200));
  ok('la seña coincide con el reparto del motor',
     r.sena_a_transferir === precioUnitarioARS(esperado.alConfirmar),
     `herramienta: ${r.sena_a_transferir} / motor: ${precioUnitarioARS(esperado.alConfirmar)}`);

  // EL CHEQUEO QUE HABRIA ATAJADO EL 21%.
  //
  // La seña que el asistente le dicta al cliente tiene que ser la misma que la
  // orden va a guardar en deposit_amount, porque es contra ese numero que el
  // equipo concilia la transferencia. `orders.total` es NETO —sin IVA— y
  // deposit_amount es su mitad, asi que si el asistente cotiza sobre el total
  // con IVA le pide un 21% de mas a alguien que ya esta por transferir.
  const comoLaGuardaLaOrden = repartirElPago(q.subtotal!).alConfirmar;
  ok('coincide con el deposit_amount que va a guardar la orden',
     r.sena_a_transferir === precioUnitarioARS(comoLaGuardaLaOrden),
     `el asistente dice ${r.sena_a_transferir} y la orden guardaria ` +
     `${precioUnitarioARS(comoLaGuardaLaOrden)} — SENA_SOBRE='${SENA_SOBRE}'`);

  ok('dice sobre que total sale, para que el numero le cierre',
     typeof r.la_sena_se_calcula_sobre === 'string' && r.la_sena_se_calcula_sobre.length > 0,
     r.la_sena_se_calcula_sobre);
  ok('y la instruccion obliga a aclararlo',
     /ACLARALE/.test(String(r.instruccion)) && String(r.instruccion).includes(r.la_sena_se_calcula_sobre),
     r.instruccion);

  // Le pague como le pague, el cliente termina pagando el total con IVA.
  const aPesos = (s: string) => Number(String(s).replace(/[$.]/g, '').replace(',', '.'));
  ok('seña + saldo dan el total con IVA',
     Math.abs(aPesos(r.sena_a_transferir) + aPesos(r.saldo_estimado) - q.total_with_tax!) < 0.01,
     `${r.sena_a_transferir} + ${r.saldo_estimado} vs ${precioUnitarioARS(q.total_with_tax!)}`);
  ok('viene formateada en pesos, lista para copiar',
     /^\$[\d.]+(,\d{2})?$/.test(r.sena_a_transferir || ''), r.sena_a_transferir);
  ok('tambien da el total, para que la cuenta se pueda mostrar',
     r.total_con_iva === precioUnitarioARS(q.cotizable ? q.total_with_tax! : 0), r.total_con_iva);
  ok('y el saldo', !!r.saldo_estimado);

  // Lo que evita que el modelo invente: la instruccion trae el monto escrito.
  ok('la instruccion repite el monto, asi el modelo lo copia y no lo deduce',
     String(r.instruccion).includes(r.sena_a_transferir), r.instruccion);
  ok('y le prohibe redondear', /sin\s+redondearlo/.test(String(r.instruccion)), r.instruccion);
  ok('manda pasar el CBU en el mismo mensaje',
     /datos_para_transferir/.test(String(r.instruccion)), r.instruccion);
}

console.log('');
console.log('La seña es cerrada; el saldo, no. Y se dice.');
{
  const r = JSON.parse(await buscar('condiciones_de_pago').run({
    largo_mm: 1470, ancho_mm: 210, alto_mm: 780, cantidad: 297, colores_impresion: 0,
  }));
  ok('el campo del saldo se llama estimado', 'saldo_estimado' in r);
  ok('explica la variacion de produccion',
     /5%/.test(r.sobre_el_saldo || '') && /entregado/.test(r.sobre_el_saldo || ''), r.sobre_el_saldo);
  ok('la instruccion manda decirlo como estimado',
     /estimado/.test(String(r.instruccion)), r.instruccion);
}

console.log('');
console.log('Sin cotizacion no hay monto — y no se inventa uno');
{
  const r = JSON.parse(await buscar('condiciones_de_pago').run({}));
  ok('sin medidas no hay monto', r.hay_monto === false, JSON.stringify(r).slice(0, 200));
  ok('pero si la condicion, para poder contestar algo', !!r.condicion && !!r.formas_de_pago);
  ok('y NO devuelve ningun numero en pesos que el modelo pueda repetir',
     !JSON.stringify({ ...r, sobre_el_saldo: '' }).includes('$'), JSON.stringify(r));
  ok('le dice al modelo que vuelva a llamarla con las medidas',
     /volve a llamarme/i.test(String(r.instruccion)), r.instruccion);

  // LOS COLORES NO SE ASUMEN. Con las medidas pero sin colores, el total de
  // una caja impresa es otro y la seña saldria distinta a la que ya se dijo.
  const sinColores = JSON.parse(await buscar('condiciones_de_pago').run({
    largo_mm: 1470, ancho_mm: 210, alto_mm: 780, cantidad: 297,
  }));
  ok('sin los colores NO calcula un monto', sinColores.hay_monto === false, JSON.stringify(sinColores).slice(0, 200));
  ok('y pide el dato en vez de asumir lisa',
     /colores_impresion/.test(String(sinColores.instruccion)), sinColores.instruccion);
  ok('y frena al modelo antes de que hable',
     /NO le digas nada/.test(String(sinColores.instruccion)), sinColores.instruccion);

  // Que la impresion cambie el total de verdad es lo que hace que importe.
  const lisa = JSON.parse(await buscar('condiciones_de_pago').run({
    largo_mm: 400, ancho_mm: 300, alto_mm: 300, cantidad: 4000, colores_impresion: 0,
  }));
  const impresa = JSON.parse(await buscar('condiciones_de_pago').run({
    largo_mm: 400, ancho_mm: 300, alto_mm: 300, cantidad: 4000, colores_impresion: 3,
  }));
  ok('las dos cotizan', lisa.hay_monto === true && impresa.hay_monto === true);

  // El invariante que importa: en CADA respuesta, la seña es el porcentaje del
  // total de ESA respuesta. Si algún día la impresión se cobra, los dos totales
  // se separan y cada seña sigue saliendo del suyo — que es justo lo que no
  // pasaba cuando los colores se asumían en 0.
  const aNumero = (s: string) => Number(String(s).replace(/[$.]/g, '').replace(',', '.'));
  for (const [nombre, resp] of [['lisa', lisa], ['impresa', impresa]] as const) {
    const base = aNumero(SENA_SOBRE === 'neto' ? resp.subtotal_sin_iva : resp.total_con_iva);
    const sena = aNumero(resp.sena_a_transferir);
    ok(`la seña de la ${nombre} es el ${SENA_PCT}% de SU propia base`,
       Math.abs(sena - (base * SENA_PCT) / 100) < 0.01,
       `${resp.la_sena_se_calcula_sobre} ${SENA_SOBRE === 'neto' ? resp.subtotal_sin_iva : resp.total_con_iva} → seña ${resp.sena_a_transferir}`);
    // Y el saldo cierra el total con IVA en las dos.
    ok(`y en la ${nombre} seña + saldo dan el total con IVA`,
       Math.abs(sena + aNumero(resp.saldo_estimado) - aNumero(resp.total_con_iva)) < 0.01,
       `${resp.sena_a_transferir} + ${resp.saldo_estimado} vs ${resp.total_con_iva}`);
  }

  // Un pedido por debajo del minimo no tiene precio, asi que tampoco seña.
  const bajo = JSON.parse(await buscar('condiciones_de_pago').run({
    largo_mm: 200, ancho_mm: 200, alto_mm: 100, cantidad: 10, colores_impresion: 0,
  }));
  ok('un pedido que no se puede vender no tiene seña', bajo.hay_monto === false, JSON.stringify(bajo).slice(0, 200));
  ok('y manda resolver eso primero', /cotizar_cajas/.test(String(bajo.instruccion)), bajo.instruccion);
}

console.log('');
console.log('La otra puerta lleva a la misma verdad');
{
  const c = JSON.parse(await buscar('condiciones_y_precios').run({}));
  ok('condiciones_y_precios ya dice como se paga', !!c.pago?.formas && !!c.pago?.condicion);
  ok('deriva de PAGO, no lo repite', c.pago.formas === PAGO.formas && c.pago.condicion === PAGO.corto);
  ok('y manda calcular el monto en la otra herramienta',
     /condiciones_de_pago/.test(c.pago.el_monto_exacto || ''), c.pago.el_monto_exacto);
}

console.log('');
console.log('El prompt manda usarla y no calcular');
{
  const { INSTRUCCIONES } = await import('@/lib/agente/index');
  ok('nombra la herramienta', /condiciones_de_pago/.test(INSTRUCCIONES));
  ok('prohibe multiplicar el total', /NUNCA saques la seña multiplicando/.test(INSTRUCCIONES));
  // El prompt es corto a proposito y no lleva datos: ningun numero adentro.
  ok('no escribe el porcentaje: sale de la herramienta',
     !new RegExp(`${SENA_PCT}\\s*%`).test(INSTRUCCIONES), 'el prompt tiene el numero escrito');

  // LA CONTRADICCION QUE HABRIA DEJADO EL BUG INTACTO.
  //
  // El prompt listaba "formas de pago" como ejemplo de lo que NINGUNA
  // herramienta contesta, y la descripcion de no_se_la_respuesta tambien.
  // Agregar la herramienta y dejar eso escrito es agregarla y decirle al
  // modelo que no la use: el 24/08 el camino que tomo fue exactamente ese.
  ok('el prompt ya NO manda las formas de pago a no_se_la_respuesta',
     !/ninguna herramienta contesta: formas de pago/.test(INSTRUCCIONES));

  const desc = herramientas.find((t) => t.name === 'no_se_la_respuesta') as unknown as
    { description: string };
  ok('y la herramienta de "no sé" tampoco las reclama como suyas',
     !/herramientas: formas de pago/.test(desc.description), desc.description.slice(0, 120));
  ok('al contrario: manda el pago a condiciones_de_pago',
     /condiciones_de_pago/.test(desc.description), desc.description.slice(-160));
}

console.log('');
console.log('Lo que le decimos al cliente es lo que el sistema sabe cobrar');
{
  // El sistema acepta cuatro medios y el texto mencionaba tres: el eCheq
  // existia en el tipo, en el endpoint y en el panel, y no se lo deciamos a
  // nadie. Este chequeo ata el texto al tipo, asi que el dia que se agregue un
  // medio nuevo salta acá en vez de quedar escondido seis meses.
  const tipos = readFileSync('src/lib/types/database.ts', 'utf8');
  const union = tipos.match(/export type PaymentMethod =([^;]+);/)?.[1] ?? '';
  const medios = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  ok('se leyeron los medios del tipo', medios.length >= 3, medios.join(', '));

  const comoLosNombramos: Record<string, RegExp> = {
    transferencia: /transferencia/i,
    cheque: /cheque/i,
    efectivo: /efectivo/i,
    echeq: /echeq/i,
  };
  const faltan = medios.filter((m) => !(comoLosNombramos[m] ?? /$^/).test(PAGO.formas));
  ok('PAGO.formas nombra TODOS los medios que el sistema registra',
     faltan.length === 0, `faltan: ${faltan.join(', ')} — PAGO.formas dice "${PAGO.formas}"`);

  // Y al reves: que no prometamos uno que el sistema no sabe registrar.
  ok('y no promete ninguno que el sistema no acepte',
     !/tarjeta|credito|debito|mercado\s*pago/i.test(PAGO.formas), PAGO.formas);
}

console.log('');
console.log('El saldo, cuando se confirman las cantidades finales');
{
  const cq = readFileSync('src/app/api/orders/[id]/confirm-quantities/route.ts', 'utf8');
  ok('sale del mismo reparto', /repartirElPago\(newTotal\)\.contraEntrega/.test(cq));
  ok('y ya no multiplica por 0.5', !/newTotal \* 0\.5/.test(cq));
}

console.log('');
console.log('Los carteles del panel tambien derivan');
{
  const det = readFileSync('src/app/(dashboard)/ordenes/[id]/page.tsx', 'utf8');
  ok('el detalle de la orden interpola', /Seña \(\{SENA_PCT\}%\)/.test(det) && /Saldo \(\{100 - SENA_PCT\}%\)/.test(det));
  const nueva = readFileSync('src/app/(dashboard)/ordenes/nueva/page.tsx', 'utf8');
  ok('la orden nueva tambien', /vacío = \$\{SENA_PCT\}%/.test(nueva));
  const { PAYMENT_SCHEME_LABELS } = await import('@/lib/types/database');
  ok('y la etiqueta del esquema se arma sola',
     PAYMENT_SCHEME_LABELS.standard === `Estándar (${SENA_PCT}% + ${100 - SENA_PCT}%)`,
     PAYMENT_SCHEME_LABELS.standard);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
