/**
 * El ciclo completo: el asistente no sabe, el equipo responde, el asistente sabe.
 *
 * Corre tres conversaciones de verdad contra el modelo, con la base real en el
 * medio, porque lo que hay que verificar no es que las piezas existan sino que
 * el modelo las use: que llame a la herramienta en vez de inventar, que le avise
 * a la persona sin mandarla a otro lado, que siga atendiendo lo demás, y que la
 * próxima vez conteste solo.
 *
 * Gasta unos centavos de la API. Borra lo que deja.
 *
 *   npx tsx scripts/qa-agente-aprende.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { responder } = await import('@/lib/agente/index');
const { responderPregunta, preguntasPendientes } = await import('@/lib/conocimiento');
const { createAdminClient } = await import('@/lib/supabase/admin');

const db = createAdminClient();
let fallos = 0;

function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

// Una pregunta que ninguna herramienta puede contestar y que no se parece a
// nada que ya sepamos.
const PREGUNTA = '¿ustedes hacen cajas con ventana de acetato transparente?';

try {
  // ───────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('1. Le preguntan algo que no sabe');
  const r1 = await responder(PREGUNTA, [], { canal: 'web' });
  console.log(`     herramientas: ${r1.herramientasUsadas.join(', ') || 'ninguna'}`);
  console.log(`     "${r1.texto.replace(/\n/g, ' ').slice(0, 220)}"`);

  ok('llama a no_se_la_respuesta', r1.herramientasUsadas.includes('no_se_la_respuesta'));
  ok('avisa que le va a contestar una persona',
     /equipo|alguien|persona|consult/i.test(r1.texto), r1.texto.slice(0, 200));
  // Lo que NO tiene que hacer: mandarla a preguntar de nuevo a otro lado.
  ok('no la manda a escribir a otro lado',
     !/wa\.me|escribinos al|mandanos un (mail|whatsapp)/i.test(r1.texto), r1.texto.slice(0, 200));
  ok('no inventa una respuesta',
     !/^s[ií],|^no,|hacemos cajas con ventana/i.test(r1.texto.trim()), r1.texto.slice(0, 120));

  const pendientes = await preguntasPendientes();
  const anotada = pendientes.find((p) => /ventana|acetato/i.test(p.pregunta));
  ok('queda anotada para el equipo', !!anotada, `pendientes: ${pendientes.length}`);

  // ───────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('2. Sigue atendiendo el resto de la conversación');
  const r2 = await responder(
    'ok. aparte de eso, cuanto me salen 1500 cajas de 400x300x300?',
    [{ role: 'user', content: PREGUNTA }, { role: 'assistant', content: r1.texto }],
    { canal: 'web' },
  );
  console.log(`     herramientas: ${r2.herramientasUsadas.join(', ') || 'ninguna'}`);
  ok('cotiza igual', r2.herramientasUsadas.includes('cotizar_cajas'));
  ok('da el precio', /1\.305\.000|1\.579\.050/.test(r2.texto), r2.texto.slice(0, 200));

  // ───────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('3. El equipo responde, y el asistente aprende');
  if (!anotada) {
    fallos++;
    console.log('  FALLA no hay pregunta anotada, no se puede seguir');
  } else {
    await responderPregunta(
      anotada.id,
      'No hacemos cajas con ventana ni con acetato: trabajamos solo cartón corrugado, ' +
        'sin troquelados con film. Si necesitás que se vea el contenido, algunos clientes ' +
        'usan una caja lisa con una etiqueta impresa.',
      'qa@ejemplo.test',
    );

    const r3 = await responder(
      'hola, hacen cajas con ventanita transparente para ver lo que hay adentro?',
      [],
      { canal: 'web' },
    );
    console.log(`     herramientas: ${r3.herramientasUsadas.join(', ') || 'ninguna'}`);
    console.log(`     "${r3.texto.replace(/\n/g, ' ').slice(0, 220)}"`);

    ok('busca antes de contestar', r3.herramientasUsadas.includes('no_se_la_respuesta'));
    ok('ahora sí contesta con lo que dijo el equipo',
       /no hacemos|no trabajamos|solo cart[oó]n|etiqueta/i.test(r3.texto), r3.texto.slice(0, 220));
    ok('y no vuelve a decir que va a preguntar',
       !/le voy a pedir|ya pedí que|alguien del equipo te va a/i.test(r3.texto), r3.texto.slice(0, 220));

    const siguenPendientes = await preguntasPendientes();
    ok('no la anota de nuevo',
       !siguenPendientes.some((p) => /ventana|acetato/i.test(p.pregunta)));
  }
} finally {
  const { data } = await db
    .from('base_de_conocimiento')
    .select('id, pregunta')
    .or('pregunta.ilike.%ventana%,pregunta.ilike.%acetato%');
  if (data?.length) {
    await db.from('base_de_conocimiento').delete().in('id', data.map((r) => r.id as string));
    console.log(`\n  (borradas ${data.length} filas de prueba)`);
  }
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
