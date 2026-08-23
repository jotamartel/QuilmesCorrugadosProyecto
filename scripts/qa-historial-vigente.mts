/**
 * El historial que lee el asistente no arrastra conversaciones viejas.
 *
 * POR QUÉ
 *
 * getRecentConversationHistory() tomaba los últimos N mensajes de ese teléfono
 * sin mirar de cuándo eran. En el primer mensaje real por Meta se vio: el
 * asistente saludó por un nombre que la persona había escrito cuatro días antes,
 * en una prueba.
 *
 * Lo que importa no es el saludo. Es que alguien que cotizó hace meses vuelva a
 * escribir y el asistente lea esa cotización como si fuera de ahora, con precios
 * que ya no rigen, y se la confirme.
 *
 *   npx tsx scripts/qa-historial-vigente.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.local', '.env.qa.tmp']) {
  if (existsSync(f)) dotenv.config({ path: f, override: false });
}

const { getRecentConversationHistory } = await import('@/lib/whatsapp-ai');
const { createAdminClient } = await import('@/lib/supabase/admin');

const db = createAdminClient();
const TEL = '+5491100000000';
let fallos = 0;

function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}

/** Un mensaje con fecha puesta a mano. */
async function mensaje(texto: string, diasAtras: number, direction: 'inbound' | 'outbound' = 'inbound') {
  const cuando = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000).toISOString();
  await db.from('communications').insert({
    channel: 'whatsapp',
    direction,
    content: texto,
    created_at: cuando,
    metadata: { phone: TEL },
  });
}

try {
  console.log('');
  console.log('Mensajes de hoy y de hace tres dias: los lee');
  await mensaje('soy Ricardo Montoto', 3);
  await mensaje('necesito 500 cajas', 0);
  {
    const h = await getRecentConversationHistory(TEL, 10);
    const textos = h.map((t) => t.content).join(' | ');
    ok('trae los dos', h.length === 2, textos);
    ok('incluye el de hace tres dias', /Ricardo/.test(textos), textos);
  }

  console.log('');
  console.log('Un mensaje de hace dos meses: NO lo lee');
  await db.from('communications').delete().eq('metadata->>phone', TEL);
  await mensaje('cotizacion de marzo, total $800.000', 60);
  await mensaje('hola, otra vez', 0);
  {
    const h = await getRecentConversationHistory(TEL, 10);
    const textos = h.map((t) => t.content).join(' | ');
    ok('trae solo el de hoy', h.length === 1, textos);
    ok('el precio viejo NO llega al modelo', !/800\.000/.test(textos), textos);
  }

  console.log('');
  console.log('Justo en el borde');
  await db.from('communications').delete().eq('metadata->>phone', TEL);
  await mensaje('hace seis dias', 6);
  await mensaje('hace ocho dias', 8);
  {
    const h = await getRecentConversationHistory(TEL, 10);
    const textos = h.map((t) => t.content).join(' | ');
    ok('seis dias entra', /seis/.test(textos), textos);
    ok('ocho dias no', !/ocho/.test(textos), textos);
  }

  console.log('');
  console.log('Sin historial no explota');
  await db.from('communications').delete().eq('metadata->>phone', TEL);
  {
    const h = await getRecentConversationHistory(TEL, 10);
    ok('devuelve vacio', Array.isArray(h) && h.length === 0);
  }
} finally {
  const { error } = await db.from('communications').delete().eq('metadata->>phone', TEL);
  console.log(error ? `\n  no se pudo limpiar: ${error.message}` : '\n  (filas de prueba borradas)');
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
