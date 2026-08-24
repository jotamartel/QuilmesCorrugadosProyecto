/**
 * El circuito de la plata: alias configurable, pagos completos, saldo con rastro.
 *
 * POR QUE
 *
 * Tres cosas estaban mal y una era invisible:
 *
 * 1. El alias no vivia en NINGUN lado: se tipeaba a mano en cada chat.
 * 2. payments solo registraba cheques: 8 de los pagos historicos no estaban.
 * 3. confirm-quantities pisaba el presupuesto original sin dejar rastro.
 *
 * Y la invisible: system_config tiene RLS prendido con cero policies, y el
 * modulo de configuracion usaba el cliente de sesion — leia VACIO en silencio
 * y el guardado rebotaba. El tab Empresa estuvo roto quien sabe cuanto. Por
 * eso el primer bloque de aca prueba el modulo contra la base de verdad.
 *
 *   npx tsx scripts/qa-plata.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); }
}

const { getBankDataForClient, getPaymentBankConfig, setConfigValues, invalidateConfigCache } =
  await import('@/lib/config/system');
const { formatearAliasParaWhatsApp } = await import('@/lib/pagos/datos-bancarios');
const { createAdminClient } = await import('@/lib/supabase/admin');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();

// Los valores reales que haya cargado Fernando se preservan y se restauran al
// final: esta QA corre contra la base viva.
const KEYS = ['payment_bank_alias', 'payment_bank_cbu', 'payment_bank_holder', 'payment_bank_cuit', 'payment_bank_name'];
const { data: antes } = await db.from('system_config').select('key, value').in('key', KEYS);
const valoresPrevios = Object.fromEntries((antes ?? []).map((r) => [r.key, r.value]));

try {
  console.log('');
  console.log('El modulo de config lee y escribe DE VERDAD (la trampa del RLS)');
  {
    await setConfigValues({ payment_bank_name: 'Banco QA' });
    invalidateConfigCache();
    const c = await getPaymentBankConfig();
    ok('setConfigValues escribe y getPaymentBankConfig lo lee', c.payment_bank_name === 'Banco QA',
       `leyo "${c.payment_bank_name}" — si esta vacio, el modulo volvio al cliente de sesion y RLS lo dejo mudo`);
  }

  console.log('');
  console.log('Todo o nada: con datos incompletos no se publica nada');
  {
    await setConfigValues({
      payment_bank_alias: 'quilmes.qa', payment_bank_cbu: '',
      payment_bank_holder: 'Quilmes QA', payment_bank_cuit: '30-11111111-1', payment_bank_name: '',
    });
    invalidateConfigCache();
    ok('falta el CBU → null', (await getBankDataForClient()) === null);
  }
  {
    await setConfigValues({ payment_bank_cbu: '0000003100010000000001' });
    invalidateConfigCache();
    const d = await getBankDataForClient();
    ok('los 4 cargados → objeto completo', !!d && d.alias === 'quilmes.qa' && d.cbu.length === 22, JSON.stringify(d));
    ok('banco vacio → bank null, no string vacio', d?.bank === null);
  }

  console.log('');
  console.log('El mensaje de WhatsApp, redactado una sola vez');
  {
    const d = { alias: 'quilmes.qa', cbu: '0000003100010000000001', holder: 'Quilmes QA', cuit: '30-11111111-1', bank: null };
    const suelto = formatearAliasParaWhatsApp(d);
    ok('sin pedido: los 4 datos y el pedido del comprobante',
       /Alias: quilmes\.qa/.test(suelto) && /CBU: 0{6}31/.test(suelto) && /CUIT 30-11111111-1/.test(suelto) && /comprobante/.test(suelto),
       suelto);
    ok('sin banco no imprime "Banco:"', !/Banco:/.test(suelto));
    const conPedido = formatearAliasParaWhatsApp(d, { orderNumber: 'OC-2026-0004', balanceAmount: 1268750 });
    ok('con pedido: numero y saldo formateado', /^Pedido OC-2026-0004/.test(conPedido) && /\$1\.268\.750/.test(conPedido), conPedido);
    ok('saldo 0 no imprime "Saldo a pagar"',
       !/Saldo/.test(formatearAliasParaWhatsApp(d, { orderNumber: 'OC-X', balanceAmount: 0 })));

    // El alias real termina en punto, y el punto es parte del dato. En un
    // mensaje se lee como puntuacion: la aclaracion tiene que aparecer sola.
    const conPunto = formatearAliasParaWhatsApp({ ...d, alias: 'quilmes.corrugados.' });
    ok('alias con punto final: el mensaje lo aclara', /punto final es parte del alias/.test(conPunto), conPunto);
    ok('sin punto no hay aclaracion de mas', !/punto final/.test(formatearAliasParaWhatsApp(d)));
  }

  console.log('');
  console.log('La herramienta del agente');
  {
    const { crearHerramientas } = await import('@/lib/agente/herramientas');
    type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
    const tool = (crearHerramientas({ canal: 'whatsapp', telefono: '+5491100000000' }) as Tool[])
      .find((t) => t.name === 'datos_para_transferir')!;
    ok('existe', !!tool);
    const r = JSON.parse(await tool.run({}));
    ok('con config cargada da los 4 datos', r.disponible === true && r.alias === 'quilmes.qa' && r.cbu && r.titular && r.cuit, JSON.stringify(r));
    ok('con instruccion de comprobante', /comprobante/.test(r.instruccion || ''));
    ok('alias sin punto: la instruccion no habla del punto', !/punto/.test(r.instruccion || ''));

    await setConfigValues({ payment_bank_alias: 'quilmes.qa.' });
    invalidateConfigCache();
    const rPunto = JSON.parse(await tool.run({}));
    ok('alias con punto: la instruccion le avisa al modelo',
       /PARTE del alias/.test(rPunto.instruccion || ''), rPunto.instruccion);

    await setConfigValues({ payment_bank_alias: '' });
    invalidateConfigCache();
    const r2 = JSON.parse(await tool.run({}));
    ok('config incompleta: disponible false y deriva', r2.disponible === false && /derivar_a_humano/.test(r2.instruccion || ''), JSON.stringify(r2));

    // La variacion de produccion: el saldo despues de la seña es estimado.
    // La regla vive en el motor y el agente la cuenta desde condiciones.
    const cond = JSON.parse(await (crearHerramientas({ canal: 'whatsapp', telefono: '+5491100000000' }) as Tool[])
      .find((t) => t.name === 'condiciones_y_precios')!.run({}));
    ok('condiciones explica la variacion de cantidades',
       /5%/.test(cond.cantidades_y_saldo || '') && /entregado/.test(cond.cantidades_y_saldo || ''),
       cond.cantidades_y_saldo);
  }

  console.log('');
  console.log('El endpoint publico en produccion');
  {
    const res = await fetch('https://www.quilmescorrugados.com.ar/api/public/bank-data').catch(() => null);
    if (!res) {
      console.log('  ·    sin red o aun sin deploy: se salta');
    } else if (res.status === 404) {
      console.log('  ·    404: el deploy de esta etapa todavia no salio (esperable en la primera corrida)');
    } else {
      const b = await res.json();
      ok('responde 200', res.status === 200);
      ok('sin datos cargados responde available:false; con datos, los 5 campos y nada mas',
         b.available === false || (b.available === true && Object.keys(b).sort().join(',') === 'alias,available,bank,cbu,cuit,holder'),
         JSON.stringify(b));
    }
  }

  console.log('');
  console.log('confirm-quantities: el snapshot existe y suma');
  {
    // Sin tocar ordenes reales: se verifica la tabla y su forma. El flujo
    // completo contra una orden se prueba cuando exista la orden de QA de la
    // etapa 5 (crear orden manual), que trae su propia limpieza.
    const { error } = await db.from('order_quantity_adjustments').select('id').limit(1);
    ok('la tabla se lee con service_role', !error, error?.message);
    const { error: e2 } = await db.from('order_quantity_adjustments').insert({
      order_id: '00000000-0000-4000-8000-000000000000',
      previous_subtotal: 1, previous_total: 1, previous_balance_amount: 1, previous_total_m2: 1,
      delivered_total_m2: 1, new_subtotal: 1, new_total: 1, new_balance_amount: 1, precision_percent: 100,
    });
    ok('la FK rechaza una orden inexistente', !!e2 && /foreign key|violates/i.test(e2.message), e2?.message);
  }

  console.log('');
  console.log('payments: el insert ya no discrimina por metodo (verificacion estatica)');
  {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/api/orders/[id]/payment/route.ts', 'utf8');
    const dentroDelIf = /if \(isCheckPayment[^}]*\.from\('payments'\)/s.test(src);
    ok('el insert en payments esta AFUERA del if del cheque', !dentroDelIf && /TODO PAGO DEJA FILA/.test(src));
    ok('el cheque sigue entrando a la cartera', /from\('checks'\)\.insert/.test(src));
  }
} finally {
  // Restaurar lo que habia antes de la QA, sea lo que sea.
  await setConfigValues(valoresPrevios);
  invalidateConfigCache();
  console.log('\n  (config bancaria restaurada a su estado previo)');
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
