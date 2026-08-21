/**
 * Prueba la capa de transporte de WhatsApp sin tocar la red.
 *
 * POR QUE EXISTE
 *
 * El codigo de Meta esta escrito contra la documentacion, no contra trafico
 * real: la cuenta todavia esta en tramite. Lo que si se puede verificar ahora,
 * y es la mitad de los errores posibles, es que sepa leer los cuerpos que Meta
 * dice que manda —incluyendo los avisos de estado que NO son mensajes—, que la
 * firma acepte la buena y rechace la mala, y que el alta del webhook devuelva
 * el desafio.
 *
 * Y del lado de Twilio: que el cambio a esta capa no le haya roto nada al
 * numero que hoy esta atendiendo clientes.
 *
 *   npx tsx scripts/qa-transporte-whatsapp.mts
 */

import crypto from 'node:crypto';

const APP_SECRET = 'secreto-de-prueba';

// Las credenciales se fijan ANTES de importar los modulos: se leen al cargar.
process.env.META_WA_APP_SECRET = APP_SECRET;
process.env.META_WA_VERIFY_TOKEN = 'token-de-alta';
process.env.META_WA_TOKEN = process.env.META_WA_TOKEN || 'token-falso';
process.env.META_WA_PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID || '000';

const { transporteMeta } = await import('../src/lib/whatsapp-transporte/meta');
const { transporteTwilio } = await import('../src/lib/whatsapp-transporte/twilio');
const { normalizarTelefono } = await import('../src/lib/whatsapp-transporte/tipos');

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

function pedido(url: string, cabeceras: Record<string, string> = {}): Request {
  return new Request(url, { headers: cabeceras });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nMeta — leer mensajes entrantes');

const mensajeDeTexto = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{
    id: '123',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '541133334444', phone_number_id: '999' },
        contacts: [{ profile: { name: 'Cliente' }, wa_id: '5491133334444' }],
        messages: [{
          from: '5491133334444',
          id: 'wamid.ABC',
          timestamp: '1740000000',
          type: 'text',
          text: { body: '  Hola, necesito cajas  ' },
        }],
      },
    }],
  }],
});

verificar('texto', transporteMeta.leerEntrante(mensajeDeTexto, pedido('https://x/y')), {
  telefono: '+5491133334444',
  texto: 'Hola, necesito cajas',
  tieneMedia: false,
  id: 'wamid.ABC',
});

// Un aviso de estado llega por el MISMO webhook. Confundirlo con un mensaje
// haria que el asistente le conteste a nadie, o peor, que reprocese el flujo.
const avisoDeEstado = JSON.stringify({
  entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.ABC', status: 'delivered' }] } }] }],
});
verificar('aviso de estado se ignora', transporteMeta.leerEntrante(avisoDeEstado, pedido('https://x/y')), null);

const audio = JSON.stringify({
  entry: [{ changes: [{ value: { messages: [{ from: '5491133334444', id: 'w2', type: 'audio', audio: { id: 'a1' } }] } }] }],
});
verificar('audio marca media', transporteMeta.leerEntrante(audio, pedido('https://x/y'))?.tieneMedia, true);

const boton = JSON.stringify({
  entry: [{ changes: [{ value: { messages: [{
    from: '5491133334444', id: 'w3', type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Si, cotizar' } },
  }] } }] }],
});
verificar('boton trae su texto', transporteMeta.leerEntrante(boton, pedido('https://x/y'))?.texto, 'Si, cotizar');

verificar('cuerpo roto no explota', transporteMeta.leerEntrante('{no es json', pedido('https://x/y')), null);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nMeta — firma del webhook');

const firmaBuena = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(mensajeDeTexto, 'utf8').digest('hex');

verificar('firma correcta',
  await transporteMeta.firmaValida(pedido('https://x/y', { 'x-hub-signature-256': firmaBuena }), mensajeDeTexto),
  true);

verificar('firma de otro cuerpo',
  await transporteMeta.firmaValida(pedido('https://x/y', { 'x-hub-signature-256': firmaBuena }), avisoDeEstado),
  false);

verificar('firma de largo distinto',
  await transporteMeta.firmaValida(pedido('https://x/y', { 'x-hub-signature-256': 'sha256=corta' }), mensajeDeTexto),
  false);

// null, no false: sin cabecera no es que la firma este mal, es que no hay con
// que verificar. El webhook los trata distinto a proposito.
verificar('sin cabecera devuelve null',
  await transporteMeta.firmaValida(pedido('https://x/y'), mensajeDeTexto),
  null);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nMeta — alta del webhook');

const alta = transporteMeta.responderVerificacionDeAlta!(
  pedido('https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=token-de-alta&hub.challenge=1234567890'),
);
verificar('alta responde 200', alta?.status, 200);
verificar('alta devuelve el desafio', await alta!.text(), '1234567890');

const altaMalToken = transporteMeta.responderVerificacionDeAlta!(
  pedido('https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=cualquiera&hub.challenge=1234'),
);
verificar('alta con token equivocado da 403', altaMalToken?.status, 403);

// Sin desafio no es un alta: es el health check de siempre y tiene que seguir
// pasando de largo.
verificar('GET comun no lo toma como alta',
  transporteMeta.responderVerificacionDeAlta!(pedido('https://x/api/whatsapp/webhook')),
  null);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nTwilio — lo que hoy esta atendiendo clientes');

const formTwilio = new URLSearchParams({
  MessageSid: 'SM123',
  From: 'whatsapp:+5491133334444',
  To: 'whatsapp:+14155238886',
  Body: '  Hola  ',
  NumMedia: '0',
}).toString();

verificar('texto', transporteTwilio.leerEntrante(formTwilio, pedido('https://x/y')), {
  telefono: '+5491133334444',
  texto: 'Hola',
  tieneMedia: false,
  id: 'SM123',
});

const formConAudio = new URLSearchParams({
  MessageSid: 'SM124',
  From: 'whatsapp:+5491133334444',
  Body: '',
  NumMedia: '1',
  MediaUrl0: 'https://api.twilio.com/media/1',
  MediaContentType0: 'audio/ogg',
}).toString();
verificar('audio marca media', transporteTwilio.leerEntrante(formConAudio, pedido('https://x/y'))?.tieneMedia, true);

verificar('sin From no hay mensaje',
  transporteTwilio.leerEntrante('Body=hola', pedido('https://x/y')),
  null);

const recibido = transporteTwilio.respuestaDeRecibido();
verificar('el recibido sigue siendo TwiML', recibido.headers.get('content-type'), 'text/xml');
verificar('y va vacio', (await recibido.text()).includes('<Response></Response>'), true);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nNumeros argentinos');

// El 9 puede venir o no, y el prefijo del canal tambien. Todo tiene que
// terminar en la misma forma: si no, la misma persona abre dos conversaciones
// y la pausa que puso el vendedor en una no aplica en la otra.
verificar('con 9', normalizarTelefono('+5491133334444'), '+5491133334444');
verificar('sin 9', normalizarTelefono('+541133334444'), '+5491133334444');
verificar('sin mas', normalizarTelefono('5491133334444'), '+5491133334444');
verificar('con prefijo del canal', normalizarTelefono('whatsapp:+5491133334444'), '+5491133334444');
verificar('con espacios', normalizarTelefono('+54 9 11 3333-4444'), '+5491133334444');

console.log(fallos === 0 ? '\nTodo bien.\n' : `\n${fallos} fallas.\n`);
process.exit(fallos === 0 ? 0 : 1);
