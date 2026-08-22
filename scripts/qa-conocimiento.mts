/**
 * La base de conocimiento, contra la base de verdad.
 *
 * POR QUÉ CONTRA LA BASE Y NO CON UN MOCK
 *
 * Lo que hace que esto funcione son dos funciones de Postgres y dos índices: el
 * ranking de texto completo en español y el parecido por trigramas. Un mock
 * reproduce lo que yo crea que hacen, que es justo lo que hay que verificar.
 *
 * Usa preguntas con una marca propia y las borra al terminar.
 *
 *   npx tsx scripts/qa-conocimiento.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.local', '.env.qa.tmp']) {
  if (existsSync(f)) dotenv.config({ path: f, override: false });
}

const {
  buscarConocimiento,
  anotarPreguntaSinRespuesta,
  responderPregunta,
  descartarPregunta,
  preguntasPendientes,
} = await import('@/lib/conocimiento');
const { createAdminClient } = await import('@/lib/supabase/admin');

const MARCA = 'zzqa';
const db = createAdminClient();
let fallos = 0;

function verificar(nombre: string, obtenido: unknown, esperado: unknown) {
  if (JSON.stringify(obtenido) === JSON.stringify(esperado)) {
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre}: esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(obtenido)}`);
  }
}

function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}

try {
  console.log('');
  console.log('Anotar una pregunta que no sabemos');
  const primera = await anotarPreguntaSinRespuesta({
    pregunta: `${MARCA} aceptan tarjeta de credito para pagar?`,
    contexto: 'Ya cotizó 1.500 cajas de 400x300x300.',
    canal: 'web',
  });
  ok('queda anotada', !!primera.id);
  verificar('es nueva', primera.esNueva, true);
  verificar('la primera vez cuenta uno', primera.vecesPreguntada, 1);

  console.log('');
  console.log('La misma pregunta no crea otra fila: suma');
  const repetida = await anotarPreguntaSinRespuesta({
    pregunta: `${MARCA} aceptan tarjetas de credito para pagar`,
    canal: 'whatsapp',
    telefono: '+5491100000000',
  });
  verificar('es la misma fila', repetida.id, primera.id);
  verificar('ya no es nueva', repetida.esNueva, false);
  verificar('la cuenta sube', repetida.vecesPreguntada, 2);

  console.log('');
  console.log('Una pregunta distinta sí crea otra');
  const otra = await anotarPreguntaSinRespuesta({
    pregunta: `${MARCA} hacen cajas con ventana transparente?`,
    canal: 'web',
  });
  ok('es otra fila', !!otra.id && otra.id !== primera.id);
  verificar('y es nueva', otra.esNueva, true);

  console.log('');
  console.log('Sin responder, el asistente no encuentra nada');
  const antes = await buscarConocimiento(`${MARCA} se puede pagar con tarjeta`);
  verificar('una pregunta pendiente NO es conocimiento', antes.length, 0);

  console.log('');
  console.log('Una vez respondida, la encuentra');
  await responderPregunta(
    primera.id!,
    'Por ahora aceptamos transferencia bancaria y efectivo contra entrega. Tarjeta todavía no.',
    'qa@ejemplo.test',
  );
  const conRespuesta = await buscarConocimiento(`${MARCA} se puede pagar con tarjeta`);
  ok('la encuentra', conRespuesta.length > 0);
  ok('trae la respuesta', /transferencia/.test(conRespuesta[0]?.respuesta || ''),
     JSON.stringify(conRespuesta[0]));

  console.log('');
  console.log('Encuentra con otras palabras, si le pasan sinónimos');
  // Es la limitación real de una búsqueda por palabras y la razón por la que la
  // herramienta le pide al modelo que agregue sinónimos: sin ellos, "formas de
  // pago" no comparte ninguna palabra con "transferencia y efectivo".
  const crudo = await buscarConocimiento(`${MARCA} formas de pago`);
  const expandido = await buscarConocimiento(`${MARCA} formas de pago tarjeta transferencia efectivo`);
  ok('con sinónimos la encuentra', expandido.length > 0);
  if (crudo.length === 0) console.log('       (sin sinónimos no la encuentra, que es lo esperado)');

  console.log('');
  console.log('No devuelve lo descartado');
  await descartarPregunta(otra.id!, 'qa@ejemplo.test');
  const pendientes = await preguntasPendientes();
  ok('sale de la lista de pendientes', !pendientes.some((p) => p.id === otra.id));

  console.log('');
  console.log('Y lo respondido tampoco queda pendiente');
  ok('la respondida ya no espera', !pendientes.some((p) => p.id === primera.id));

  console.log('');
  console.log('Una consulta sin relación no trae la respuesta de otra cosa');
  const sinRelacion = await buscarConocimiento(`${MARCA} cuanto tardan en entregar en cordoba`);
  // Puede traer candidatas por alguna palabra suelta: lo que NO puede pasar es
  // que traiga la de pago con un puntaje alto, porque el modelo la leería como
  // buena. Se verifica que, si trae algo, sea con puntaje bajo.
  ok('si trae algo, es con puntaje bajo',
     sinRelacion.length === 0 || sinRelacion[0].puntaje < 0.05,
     JSON.stringify(sinRelacion[0]));

  console.log('');
  console.log('Guardar una respuesta vacía no hace nada');
  verificar('respuesta vacía se rechaza', await responderPregunta(primera.id!, '   ', 'qa@ejemplo.test'), false);
} finally {
  const { error } = await db.from('base_de_conocimiento').delete().like('pregunta', `${MARCA}%`);
  console.log(error ? `\n  no se pudieron borrar las filas de prueba: ${error.message}` : '\n  (filas de prueba borradas)');
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
