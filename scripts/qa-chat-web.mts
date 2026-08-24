/**
 * Lo que se habla en el chat del sitio queda guardado, y aparte de WhatsApp.
 *
 * POR QUE
 *
 * El chat del sitio no guardaba nada: el endpoint contestaba y el historial
 * vivía en el navegador del visitante. Llegó una consulta real —"Cajas
 * Navideñas, trabajan?"— que el asistente no supo contestar, y cuando el
 * equipo fue a buscarla no había ni conversación ni con qué entender qué se
 * había hablado.
 *
 * Las dos promesas que esta QA defiende:
 *
 *   1. Se guarda, agrupado por sesión, con las marcas de lo que dejó
 *      pendiente. Sin las marcas la lista es un archivo muerto: nadie va a
 *      leer cien conversaciones para encontrar la que necesita respuesta.
 *   2. Guardar NUNCA rompe el chat. Si la base falla, la persona igual recibe
 *      su respuesta: vino a preguntar, no a que la registremos.
 *
 *   npx tsx scripts/qa-chat-web.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { createAdminClient } = await import('@/lib/supabase/admin');
const { anotarIntercambio, anotarContactoSiHay, contactoEnElTexto } =
  await import('@/lib/chat-web/conversaciones');

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

const db = createAdminClient();
// Marca imposible en una sesión real, para poder limpiar sin ambigüedad.
const SESION = `qa-chat-web-${Date.now()}`;

const traer = async () => {
  const { data: c } = await db.from('chat_web_conversaciones').select('*').eq('sesion', SESION).maybeSingle();
  if (!c) return { conversacion: null, mensajes: [] as Array<Record<string, unknown>> };
  const { data: m } = await db.from('chat_web_mensajes')
    .select('*').eq('conversacion_id', c.id).order('creado_en', { ascending: true });
  return { conversacion: c, mensajes: m ?? [] };
};

try {
  console.log('');
  console.log('Un ida y vuelta queda guardado');
  {
    await anotarIntercambio({
      sesion: SESION,
      pregunta: 'Hacen cajas de 40x30x30?',
      respuesta: 'Sí, esa medida está en catálogo.',
      pagina: '/precios',
    });
    const { conversacion, mensajes } = await traer();
    ok('se creó la conversación', !!conversacion);
    ok('con la página desde donde escribió', conversacion?.pagina_inicial === '/precios', String(conversacion?.pagina_inicial));
    ok('guardó los dos mensajes', mensajes.length === 2, String(mensajes.length));
    ok('el del visitante primero', mensajes[0]?.rol === 'visitante' && /40x30x30/.test(String(mensajes[0]?.contenido)));
    ok('y la respuesta del asistente', mensajes[1]?.rol === 'asistente');
    ok('lleva la cuenta', conversacion?.cantidad_mensajes === 2, String(conversacion?.cantidad_mensajes));
    ok('sin marcas: no dejó nada pendiente',
       conversacion?.hubo_pregunta_sin_respuesta === false && conversacion?.pidio_humano === false);
  }

  console.log('');
  console.log('El segundo mensaje va a la MISMA conversación');
  {
    await anotarIntercambio({
      sesion: SESION, pregunta: 'Y de 50x40x40?', respuesta: 'También.', pagina: '/precios',
    });
    const { conversacion, mensajes } = await traer();
    ok('sigue habiendo una sola conversación', mensajes.length === 4, `${mensajes.length} mensajes`);
    ok('la cuenta acompaña', conversacion?.cantidad_mensajes === 4, String(conversacion?.cantidad_mensajes));
  }

  console.log('');
  console.log('Las marcas salen de lo que el asistente HIZO, no de adivinar');
  {
    await anotarIntercambio({
      sesion: SESION,
      pregunta: 'Cajas navideñas, trabajan?',
      respuesta: 'No lo sé con certeza.',
      herramientas: ['no_se_la_respuesta'],
    });
    const { conversacion } = await traer();
    ok('queda marcada como "algo que no supo"', conversacion?.hubo_pregunta_sin_respuesta === true);
    ok('y no marca lo que no pasó', conversacion?.pidio_humano === false);
  }
  {
    // La marca se prende y NO se apaga: que después haya seguido con algo que
    // el asistente sí sabía no borra que hubo una pregunta sin respuesta.
    await anotarIntercambio({
      sesion: SESION, pregunta: 'Gracias', respuesta: 'De nada.', herramientas: [],
    });
    const { conversacion } = await traer();
    ok('la marca no se apaga con el mensaje siguiente', conversacion?.hubo_pregunta_sin_respuesta === true);
  }
  {
    await anotarIntercambio({
      sesion: SESION, pregunta: 'Quiero hablar con alguien', respuesta: 'Te paso el WhatsApp.',
      herramientas: ['derivar_a_humano'],
    });
    const { conversacion } = await traer();
    ok('marca que pidió una persona', conversacion?.pidio_humano === true);
  }

  console.log('');
  console.log('El contacto, que es lo único que permite responder');
  {
    ok('detecta un mail', contactoEnElTexto('escribime a juan.perez@empresa.com.ar') === 'juan.perez@empresa.com.ar');
    ok('detecta un teléfono', contactoEnElTexto('mi cel es 11 5555-4444') !== null,
       String(contactoEnElTexto('mi cel es 11 5555-4444')));
    // Falso positivo caro: pone un contacto inventado en el panel y alguien
    // pierde el tiempo escribiéndole.
    ok('NO confunde una medida', contactoEnElTexto('necesito cajas de 400x300x200') === null,
       String(contactoEnElTexto('necesito cajas de 400x300x200')));
    ok('NO confunde una cantidad', contactoEnElTexto('quiero 2000 cajas') === null,
       String(contactoEnElTexto('quiero 2000 cajas')));

    await anotarContactoSiHay(SESION, 'mandame info a compras@fabrica.test');
    const { conversacion } = await traer();
    ok('lo guarda en la conversación', conversacion?.contacto === 'compras@fabrica.test', String(conversacion?.contacto));

    await anotarContactoSiHay(SESION, 'o mejor a otro@distinto.test');
    const { conversacion: c2 } = await traer();
    ok('y no pisa el primero que dejó', c2?.contacto === 'compras@fabrica.test', String(c2?.contacto));
  }

  console.log('');
  console.log('Guardar nunca rompe el chat');
  {
    // Sin sesión —storage bloqueado, widget viejo cacheado— se atiende igual.
    await anotarIntercambio({ sesion: '', pregunta: 'hola', respuesta: 'hola' });
    ok('sin sesión no explota ni inventa una conversación',
       !(await db.from('chat_web_conversaciones').select('id').eq('sesion', '').maybeSingle()).data);
  }

  console.log('');
  console.log('Y sigue aparte de WhatsApp');
  {
    const { data: enWhatsApp } = await db.from('communications')
      .select('id').eq('channel', 'whatsapp').ilike('content', '%Cajas navideñas%');
    ok('lo del sitio NO se cuela en las comunicaciones de WhatsApp',
       (enWhatsApp ?? []).length === 0, `${enWhatsApp?.length} filas`);

    const { readFileSync } = await import('node:fs');
    const panel = readFileSync('src/app/(dashboard)/chat-web/page.tsx', 'utf8');
    ok('la pantalla dice que acá no se puede responder', /no se puede responder/.test(panel));
    ok('y no tiene campo para escribir', !/<textarea/.test(panel));
  }
} finally {
  const { data: c } = await db.from('chat_web_conversaciones').select('id').eq('sesion', SESION).maybeSingle();
  if (c) {
    await db.from('chat_web_mensajes').delete().eq('conversacion_id', c.id);
    await db.from('chat_web_conversaciones').delete().eq('id', c.id);
  }
  const { count } = await db.from('chat_web_conversaciones').select('id', { count: 'exact', head: true });
  console.log(`\n  (limpieza hecha: quedan ${count} conversaciones, las reales)`);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
