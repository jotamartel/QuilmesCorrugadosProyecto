/**
 * Prueba la parte sin red del pipeline de adjuntos de WhatsApp.
 *
 * La descarga y el guardado piden credenciales y red; lo que se puede verificar
 * acá, y es donde estaban los errores baratos, es la traducción de mimes a
 * extensiones, qué adjuntos van al agente y qué notas se arman cuando algo no
 * se pudo ver.
 *
 *   npx tsx scripts/qa-whatsapp-media.mts
 */

// Dinámico como en qa-transporte-whatsapp: el módulo llega a código que lee
// process.env al cargar, y con el import estático tsx no le encuentra los
// exports con nombre.
const { extensionParaMime, mimeLimpio, esAdjuntoParaAgente, notasParaElAgente } =
  await import('../src/lib/whatsapp-media');
import type { MediaGuardada } from '../src/lib/whatsapp-media';

let fallos = 0;

function verificar(nombre: string, obtenido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtenido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    console.log(`  ok   ${nombre}`);
  } else {
    fallos++;
    console.log(`  FALLA ${nombre}\n        esperado: ${b}\n        obtenido: ${a}`);
  }
}

/** Un adjunto guardado, con lo mínimo cambiado por prueba. */
function guardada(cambios: Partial<MediaGuardada>): MediaGuardada {
  return {
    tipo: 'imagen',
    url: 'https://bucket/x.jpg',
    mime: 'image/jpeg',
    caption: null,
    nombreDeArchivo: null,
    transcripcion: null,
    ...cambios,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nMime a extensión');

// Los audios de WhatsApp vienen con el codec pegado al mime.
verificar('audio de WhatsApp', extensionParaMime('audio/ogg; codecs=opus'), 'ogg');
verificar('foto', extensionParaMime('image/jpeg'), 'jpg');
verificar('pdf', extensionParaMime('application/pdf'), 'pdf');
verificar('video', extensionParaMime('video/mp4'), 'mp4');
verificar('subtipo desconocido pero sano', extensionParaMime('image/avif'), 'avif');
verificar('mime raro no rompe el nombre del archivo', extensionParaMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'bin');
verificar('sin mime', extensionParaMime(null), 'bin');

verificar('mime limpio', mimeLimpio('audio/ogg; codecs=opus'), 'audio/ogg');
verificar('mime vacio es null', mimeLimpio(''), null);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nQué mira el agente por su cuenta');

verificar('foto jpeg va', esAdjuntoParaAgente(guardada({})), true);
verificar('sticker webp va', esAdjuntoParaAgente(guardada({ tipo: 'sticker', mime: 'image/webp' })), true);
verificar('pdf va', esAdjuntoParaAgente(guardada({ tipo: 'documento', mime: 'application/pdf' })), true);
verificar('word no va', esAdjuntoParaAgente(guardada({ tipo: 'documento', mime: 'application/msword' })), false);
verificar('video no va', esAdjuntoParaAgente(guardada({ tipo: 'video', mime: 'video/mp4' })), false);
verificar('audio no va (va transcripto en el texto)', esAdjuntoParaAgente(guardada({ tipo: 'audio', mime: 'audio/ogg' })), false);
verificar('sin url no va, aunque sea foto', esAdjuntoParaAgente(guardada({ url: null })), false);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nNotas para el agente cuando algo no se pudo ver');

verificar('foto guardada: sin notas', notasParaElAgente([guardada({})]).length, 0);
verificar('audio transcripto: sin notas',
  notasParaElAgente([guardada({ tipo: 'audio', mime: 'audio/ogg', transcripcion: 'hola' })]).length, 0);
verificar('audio sin transcripcion: una nota',
  notasParaElAgente([guardada({ tipo: 'audio', mime: 'audio/ogg' })]).length, 1);
verificar('video: una nota', notasParaElAgente([guardada({ tipo: 'video', mime: 'video/mp4' })]).length, 1);
verificar('descarga caida: una nota', notasParaElAgente([guardada({ url: null })]).length, 1);
verificar('el nombre del archivo va en la nota',
  notasParaElAgente([guardada({ tipo: 'documento', mime: 'application/msword', nombreDeArchivo: 'lista.doc' })])[0]?.includes('lista.doc'),
  true);
// El PDF lo mira el agente: una nota diciendo que no puede abrirlo seria
// contradecir al adjunto que tiene adelante.
verificar('pdf guardado: sin notas',
  notasParaElAgente([guardada({ tipo: 'documento', mime: 'application/pdf' })]).length, 0);

console.log(fallos === 0 ? '\nTodo bien.\n' : `\n${fallos} fallas.\n`);
process.exit(fallos === 0 ? 0 : 1);
