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

const { transporteMeta, verificarFirmaMeta } = await import('../src/lib/whatsapp-transporte/meta');
import type { MensajeEntrante } from '../src/lib/whatsapp-transporte/tipos';
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

/** El unico mensaje de un lote, o null si el lote vino vacio. */
function uno(lote: MensajeEntrante[]): MensajeEntrante | null {
  return lote.length === 1 ? lote[0] : null;
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

verificar('texto', uno(transporteMeta.leerEntrantes(mensajeDeTexto, pedido('https://x/y'))), {
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
verificar('aviso de estado se ignora', transporteMeta.leerEntrantes(avisoDeEstado, pedido('https://x/y')).length, 0);

const audio = JSON.stringify({
  entry: [{ changes: [{ value: { messages: [{ from: '5491133334444', id: 'w2', type: 'audio', audio: { id: 'a1' } }] } }] }],
});
verificar('audio marca media', uno(transporteMeta.leerEntrantes(audio, pedido('https://x/y')))?.tieneMedia, true);

const boton = JSON.stringify({
  entry: [{ changes: [{ value: { messages: [{
    from: '5491133334444', id: 'w3', type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Si, cotizar' } },
  }] } }] }],
});
verificar('boton trae su texto', uno(transporteMeta.leerEntrantes(boton, pedido('https://x/y')))?.texto, 'Si, cotizar');

verificar('cuerpo roto no explota', transporteMeta.leerEntrantes('{no es json', pedido('https://x/y')).length, 0);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nMeta — un POST con varios mensajes');

// Meta batchea: cuando alguien manda dos mensajes seguidos, y cuando reintenta
// una entrega que se le acumulo, en un mismo POST vienen varios. Antes se leia
// entry[0].changes[0].messages[0] y del resto no quedaba ni registro en el
// panel: el cliente escribia "hola" y "necesito 500 cajas" y del segundo, nada.
const lote = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              { from: '5491133334444', id: 'w1', type: 'text', text: { body: 'hola' } },
              { from: '5491133334444', id: 'w2', type: 'text', text: { body: 'necesito 500 cajas' } },
            ],
          },
        },
        // Un segundo change en el mismo entry: el formato lo permite.
        {
          value: {
            messages: [
              { from: '5491133334444', id: 'w3', type: 'text', text: { body: 'de 40x30x30' } },
            ],
          },
        },
      ],
    },
    // Y un segundo entry, con un aviso de estado mezclado que hay que saltear.
    {
      changes: [
        { value: { statuses: [{ id: 'w1', status: 'delivered' }] } },
        {
          value: {
            messages: [
              { from: '5491133334444', id: 'w4', type: 'text', text: { body: 'urgente' } },
            ],
          },
        },
      ],
    },
  ],
});

const leidos = transporteMeta.leerEntrantes(lote, pedido('https://x/y'));
verificar('no se pierde ninguno', leidos.length, 4);
verificar('vienen en orden', leidos.map((m) => m.id), ['w1', 'w2', 'w3', 'w4']);
verificar('los avisos de estado no cuentan', leidos.some((m) => m.id === null), false);
verificar('el texto de cada uno', leidos.map((m) => m.texto), [
  'hola', 'necesito 500 cajas', 'de 40x30x30', 'urgente',
]);

// Un mensaje sin `from` no es de nadie: se saltea sin llevarse el resto puesto.
const loteConBasura = JSON.stringify({
  entry: [{ changes: [{ value: { messages: [
    { id: 'x1', type: 'text', text: { body: 'sin remitente' } },
    { from: '5491133334444', id: 'x2', type: 'text', text: { body: 'este si' } },
  ] } }] }],
});
verificar('un mensaje roto no se lleva al resto',
  transporteMeta.leerEntrantes(loteConBasura, pedido('https://x/y')).map((m) => m.id),
  ['x2']);

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

// Con la clave configurada, que NO venga firma no es "no puedo comprobarlo": es
// que el que llama no es Meta, porque Meta siempre firma. Tiene que dar false,
// que es lo que bloquea. Si diera null, cualquiera entra omitiendo la cabecera.
verificar('con clave y sin cabecera: false, no null',
  await transporteMeta.firmaValida(pedido('https://x/y'), mensajeDeTexto),
  false);

verificar('Meta bloquea cuando la firma no cierra', transporteMeta.rechazaFirmaInvalida, true);
verificar('Twilio no bloquea, sigue observando', transporteTwilio.rechazaFirmaInvalida, false);

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

verificar('texto', uno(transporteTwilio.leerEntrantes(formTwilio, pedido('https://x/y'))), {
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
verificar('audio marca media', uno(transporteTwilio.leerEntrantes(formConAudio, pedido('https://x/y')))?.tieneMedia, true);

verificar('sin From no hay mensaje',
  transporteTwilio.leerEntrantes('Body=hola', pedido('https://x/y')).length,
  0);

const recibido = transporteTwilio.respuestaDeRecibido();
verificar('el recibido sigue siendo TwiML', recibido.headers.get('content-type'), 'text/xml');
verificar('y va vacio', (await recibido.text()).includes('<Response></Response>'), true);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nSin clave configurada no se puede comprobar nada');

// Esta es la valvula que mantiene vivo el canal si falta META_WA_APP_SECRET, y
// pasa a importar ahora que una firma invalida BLOQUEA: si este caso devolviera
// false en vez de null, un despliegue sin la clave dejaria el WhatsApp mudo.
//
// Se prueba contra verificarFirmaMeta(), que es la misma comprobacion sin la
// configuracion adentro. Antes esto intentaba recargar el modulo con la variable
// borrada y era mas harness que prueba.
verificar('sin clave: null (se atiende y se avisa)',
  verificarFirmaMeta(undefined, 'sha256=loquesea', '{}'), null);
verificar('clave vacia tambien es null',
  verificarFirmaMeta('', 'sha256=loquesea', '{}'), null);
verificar('con clave y sin cabecera: false',
  verificarFirmaMeta(APP_SECRET, null, mensajeDeTexto), false);
verificar('con clave y firma buena: true',
  verificarFirmaMeta(APP_SECRET, firmaBuena, mensajeDeTexto), true);

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

// Sin un solo digito no es un telefono. Devolvia "+", que es truthy, y con eso
// se abria una conversacion a nombre de "+".
verificar('vacio', normalizarTelefono(''), '');
verificar('solo texto', normalizarTelefono('whatsapp:'), '');
verificar('solo signos', normalizarTelefono('+- ()'), '');

console.log(fallos === 0 ? '\nTodo bien.\n' : `\n${fallos} fallas.\n`);
process.exit(fallos === 0 ? 0 : 1);
