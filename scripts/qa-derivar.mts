/**
 * Que pasa cuando alguien pide hablar con una persona.
 *
 * POR QUE
 *
 * En la primera prueba real por WhatsApp, alguien escribio "quiero hablar con un
 * asesor" y el asistente le contesto con un link de wa.me al numero desde el que
 * estaba escribiendo. La herramienta se habia escrito pensando en el chat del
 * sitio, donde eso es lo mejor que se le puede ofrecer, y por WhatsApp es un
 * absurdo.
 *
 *   npx tsx scripts/qa-derivar.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { crearHerramientas } = await import('@/lib/agente/herramientas');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

type Tool = { name: string; run: (a: Record<string, unknown>) => Promise<string> };
const derivar = (canal: 'web' | 'whatsapp') =>
  (crearHerramientas({ canal, telefono: '+5491100000000' }) as Tool[])
    .find((t) => t.name === 'derivar_a_humano')!;

console.log('');
console.log('Por WhatsApp');
{
  const r = JSON.parse(await derivar('whatsapp').run({ contexto: 'Quiere hablar con alguien.' }));
  const todo = JSON.stringify(r);
  ok('no devuelve ningun link de wa.me', !/wa\.me/.test(todo), todo.slice(0, 200));
  ok('no devuelve el telefono de la fabrica', !/3341/.test(todo), todo.slice(0, 200));
  ok('dice que ya se aviso', r.avisado === true);
  ok('le instruye a NO pasar links', /NO le pases ningun link/i.test(r.instruccion || ''));
}

console.log('');
console.log('Por el chat del sitio');
{
  const r = JSON.parse(await derivar('web').run({ contexto: 'Cotice 600 cajas y quiero avanzar.' }));
  ok('si devuelve el link con el mensaje escrito', /wa\.me\/\d+\?text=/.test(r.whatsapp || ''), r.whatsapp);
  ok('el link lleva el contexto', /600/.test(decodeURIComponent(r.whatsapp || '')));
  ok('tambien da el mail', /@/.test(r.email || ''));
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
