/**
 * Quién puede llamar a las funciones del agente de voz.
 *
 * La compuerta de acceso abre todo /api/retell/ y la nota de la lista blanca
 * decía "con su propia API key". Era cierto para una de las cuatro rutas. Las
 * otras tres contestaban 200 sin ninguna credencial, y una de ellas escribe
 * leads en la cola de ventas.
 *
 *   npx tsx scripts/qa-acceso-retell.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const SECRETO = 'secreto-de-prueba-para-la-qa';
process.env.RETELL_FUNCION_SECRET = SECRETO;

const { verificarAccesoDeRetell, respuestaSiNoCorresponde, CABECERA } =
  await import('@/lib/retell-acceso');

let fallos = 0;
function verificar(nombre: string, obtenido: unknown, esperado: unknown) {
  if (JSON.stringify(obtenido) === JSON.stringify(esperado)) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(obtenido)}`); }
}

const pedido = (cabeceras: Record<string, string> = {}) =>
  new Request('https://x/api/retell/cotizar', { method: 'POST', headers: cabeceras });

console.log('');
console.log('Con el secreto configurado');
verificar('la cabecera correcta pasa', verificarAccesoDeRetell(pedido({ [CABECERA]: SECRETO })), 'ok');
verificar('otra cabecera no pasa', verificarAccesoDeRetell(pedido({ [CABECERA]: 'otra-cosa' })), 'no-coincide');
verificar('sin cabecera no pasa', verificarAccesoDeRetell(pedido()), 'no-coincide');
// Un secreto que empieza igual no puede pasar: si pasara, se adivina de a un
// caracter midiendo el tiempo de respuesta.
verificar('un prefijo del secreto no pasa',
  verificarAccesoDeRetell(pedido({ [CABECERA]: SECRETO.slice(0, -1) })), 'no-coincide');
// Un espacio al final SI pasa, y esta bien: las cabeceras HTTP se recortan por
// especificacion, asi que el valor nunca llega con el espacio. Es a favor
// nuestro —el secreto pegado con un espacio de mas sigue funcionando— pero
// conviene tenerlo escrito para que nadie lo "arregle" pensando que es un
// agujero.
verificar('un espacio al final no rompe nada (la cabecera se recorta)',
  verificarAccesoDeRetell(pedido({ [CABECERA]: SECRETO + ' ' })), 'ok');

console.log('');
console.log('La respuesta que devuelve la ruta');
{
  const r = respuestaSiNoCorresponde(pedido({ [CABECERA]: SECRETO }), '/api/retell/cotizar');
  verificar('con la cabecera correcta, sigue', r, null);
}
{
  const r = respuestaSiNoCorresponde(pedido(), '/api/retell/cotizar');
  verificar('sin cabecera, corta con 401', r?.status, 401);
}

console.log('');
console.log('Sin secreto configurado');
{
  // El caso que mantiene vivo al agente de voz si alguien olvida la variable.
  // Importa que sea "deja pasar y avisa" y no "rechaza": rechazar dejaria al
  // agente mudo en medio de una llamada con un cliente.
  delete process.env.RETELL_FUNCION_SECRET;
  verificar('no se puede comprobar', verificarAccesoDeRetell(pedido()), 'sin-secreto');
  const r = respuestaSiNoCorresponde(pedido(), '/api/retell/cotizar');
  verificar('deja pasar (y queda el error en el log)', r, null);
  process.env.RETELL_FUNCION_SECRET = SECRETO;
}

console.log('');
console.log('Las tres rutas lo tienen puesto');
{
  const { readFileSync } = await import('node:fs');
  for (const ruta of ['cotizar', 'registrar-lead', 'transferir']) {
    const s = readFileSync(`src/app/api/retell/${ruta}/route.ts`, 'utf8');
    verificar(`${ruta} lo comprueba`, s.includes('respuestaSiNoCorresponde'), true);
    // Y que lo haga ANTES de tocar nada: si el chequeo queda despues del insert,
    // no sirve de nada.
    const iChequeo = s.indexOf('respuestaSiNoCorresponde(request');
    const iEscritura = Math.min(
      ...['.insert(', '.update(', '.upsert(', '.delete(']
        .map((x) => { const i = s.indexOf(x); return i === -1 ? Number.MAX_SAFE_INTEGER : i; }),
    );
    verificar(`${ruta} lo comprueba antes de escribir`, iChequeo < iEscritura, true);
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
