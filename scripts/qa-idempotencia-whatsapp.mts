/**
 * La idempotencia del webhook de WhatsApp, contra la base de verdad.
 *
 * POR QUÉ CONTRA LA BASE Y NO CON UN MOCK
 *
 * Lo único que hace que esto funcione es una restricción de Postgres: la clave
 * primaria de whatsapp_mensajes_procesados. Un mock la reproduce como yo crea
 * que funciona, que es exactamente lo que hay que verificar. Además el caso que
 * más importa —dos reintentos simultáneos— solo se puede probar de verdad
 * lanzando dos escrituras juntas contra la misma base.
 *
 * Usa ids de prueba con un prefijo propio y los borra al terminar.
 *
 *   npx tsx scripts/qa-idempotencia-whatsapp.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.local', '.env.qa.tmp']) {
  if (existsSync(f)) dotenv.config({ path: f, override: false });
}

const { reclamarMensaje, marcarMensajeCompletado } = await import('@/lib/whatsapp-idempotencia');
const { createAdminClient } = await import('@/lib/supabase/admin');

const TABLA = 'whatsapp_mensajes_procesados';
const PREFIJO = 'qa-idempotencia-';
const TELEFONO = '+5491100000000';
const supabase = createAdminClient();

let fallos = 0;
const creados: string[] = [];

function id(nombre: string) {
  const v = `${PREFIJO}${nombre}`;
  creados.push(v);
  return v;
}

function verificar(nombre: string, obtenido: unknown, esperado: unknown) {
  if (obtenido === esperado) {
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre}: esperaba "${esperado}", vino "${obtenido}"`);
  }
}

/** Envejece una marca para simular un intento que se murió sin terminar. */
async function envejecer(mensajeId: string, minutos: number) {
  const { error } = await supabase
    .from(TABLA)
    .update({ recibido_en: new Date(Date.now() - minutos * 60_000).toISOString() })
    .eq('id', mensajeId);
  if (error) throw error;
}

try {
  console.log('');
  console.log('El camino normal');
  {
    const m = id('normal');
    verificar('primer intento', await reclamarMensaje(m, 'meta', TELEFONO), 'nuevo');
    verificar('reintento mientras se atiende', await reclamarMensaje(m, 'meta', TELEFONO), 'duplicado');
    await marcarMensajeCompletado(m);
    verificar('reintento despues de terminar', await reclamarMensaje(m, 'meta', TELEFONO), 'duplicado');
  }

  console.log('');
  console.log('El intento que se murio a mitad');
  {
    const m = id('caido');
    verificar('lo toma', await reclamarMensaje(m, 'meta', TELEFONO), 'nuevo');
    // A los 4 minutos todavía puede estar trabajando: no se le pisa.
    await envejecer(m, 4);
    verificar('a los 4 minutos sigue siendo un duplicado', await reclamarMensaje(m, 'meta', TELEFONO), 'duplicado');
    // A los 9, o murió o se colgó tanto que el cliente ya se fue.
    await envejecer(m, 9);
    verificar('a los 9 se retoma', await reclamarMensaje(m, 'meta', TELEFONO), 'reintento_de_uno_caido');
    // Y al retomarlo, la marca se refresca: el que retomó ahora es el que trabaja.
    verificar('recien retomado, otro reintento espera', await reclamarMensaje(m, 'meta', TELEFONO), 'duplicado');
  }

  console.log('');
  console.log('Uno que se murio pero que ya habia contestado');
  {
    const m = id('completado-viejo');
    await reclamarMensaje(m, 'meta', TELEFONO);
    await marcarMensajeCompletado(m);
    await envejecer(m, 120);
    // Completado es completado: por viejo que sea, no se vuelve a atender.
    verificar('dos horas despues sigue sin reprocesarse', await reclamarMensaje(m, 'meta', TELEFONO), 'duplicado');
  }

  console.log('');
  console.log('Dos reintentos al mismo tiempo — el caso que un mock no prueba');
  {
    const m = id('carrera');
    const r = await Promise.all(
      Array.from({ length: 6 }, () => reclamarMensaje(m, 'meta', TELEFONO)),
    );
    const nuevos = r.filter((x) => x === 'nuevo').length;
    const dups = r.filter((x) => x === 'duplicado').length;
    verificar('exactamente uno pasa', nuevos, 1);
    verificar('los otros cinco se retiran', dups, 5);
  }

  console.log('');
  console.log('Dos reintentos al mismo tiempo sobre uno caido');
  {
    const m = id('carrera-caido');
    await reclamarMensaje(m, 'meta', TELEFONO);
    await envejecer(m, 30);
    const r = await Promise.all(
      Array.from({ length: 6 }, () => reclamarMensaje(m, 'meta', TELEFONO)),
    );
    const retoman = r.filter((x) => x === 'reintento_de_uno_caido').length;
    // Sin la condición adentro del UPDATE, acá pasaban los seis y el cliente
    // recibía seis respuestas.
    verificar('lo retoma uno solo', retoman, 1);
    verificar('los otros cinco se retiran', r.filter((x) => x === 'duplicado').length, 5);
  }

  console.log('');
  console.log('Sin id no se bloquea la atencion');
  {
    verificar('id nulo', await reclamarMensaje(null, 'meta', TELEFONO), 'sin_marca');
    verificar('id vacio', await reclamarMensaje('', 'meta', TELEFONO), 'sin_marca');
    // Completar un id nulo no tiene que explotar.
    await marcarMensajeCompletado(null);
    console.log('  ok   completar sin id no explota');
  }

  console.log('');
  console.log('Twilio y Meta no se pisan');
  {
    const a = id('mismo-numero-twilio');
    const b = id('mismo-numero-meta');
    verificar('un mensaje de Twilio', await reclamarMensaje(a, 'twilio', TELEFONO), 'nuevo');
    verificar('otro de Meta, mismo telefono', await reclamarMensaje(b, 'meta', TELEFONO), 'nuevo');
  }
} finally {
  const { error } = await supabase.from(TABLA).delete().like('id', `${PREFIJO}%`);
  if (error) console.error('  no se pudieron borrar las filas de prueba:', error);
  else console.log(`\n(borradas ${creados.length} filas de prueba)`);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
