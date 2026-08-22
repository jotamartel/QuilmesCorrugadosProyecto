/**
 * Prueba la firma del webhook de mails entrantes, sin tocar la red.
 *
 * POR QUE EXISTE
 *
 * /api/email/inbound escribe en `communications` con la service role, que
 * saltea RLS. Lo unico que separa ese insert de cualquiera que descubra la URL
 * es verificarFirmaResend(). Si esa funcion se equivoca para el lado flojo, el
 * endpoint queda abierto y parece cerrado; si se equivoca para el lado duro,
 * dejan de entrar los mails de los clientes. Las dos son caras, asi que se
 * prueban los cuatro casos que importan:
 *
 *   firma buena                       -> acepta
 *   firma calculada sobre otro cuerpo -> rechaza
 *   sin cabecera y con secreto puesto -> rechaza (no es "no puedo comprobar")
 *   sin secreto configurado           -> "no hay con que comprobar" (deja pasar)
 *
 * Mas el anti-replay, que es el caso que una firma valida NO cubre: un mensaje
 * viejo capturado entero tiene firma perfectamente buena.
 *
 * VECTORES FIJOS
 *
 * Verificar con la misma funcion que firma no prueba que el algoritmo sea el de
 * Svix: probaria que es consistente consigo mismo. Por eso ademas se contrasta
 * contra una firma calculada aparte, a mano, y contra el paquete `svix` mientras
 * siga estando en node_modules.
 *
 *   npx tsx scripts/qa-firma-email.mts
 */

import crypto from 'node:crypto';
import type { CabecerasDeFirma } from '../src/lib/email-firma';

// Import dinamico, igual que qa-transporte-whatsapp.mts: el cargador de ESM de
// un .mts no resuelve los exports de un .ts por la via estatica.
const {
  TOLERANCIA_EN_SEGUNDOS,
  firmarComoResend,
  leerCabecerasDeFirma,
  verificarFirmaResend,
} = await import('../src/lib/email-firma');

// Un whsec_ de mentira, con la misma forma que el del panel de Resend: el
// prefijo y 24 bytes en base64.
const SECRETO = 'whsec_' + Buffer.from('0123456789abcdef01234567', 'utf8').toString('base64');

// Hora fija: sin esto la prueba del timestamp dependeria del reloj y fallaria
// distinto segun cuando se corre.
const AHORA = 1_770_000_000;

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

/** Las tres cabeceras armadas a mano. */
function cabeceras(
  id: string | null,
  timestamp: string | number | null,
  firma: string | null,
): CabecerasDeFirma {
  return {
    id,
    timestamp: timestamp === null ? null : String(timestamp),
    firma,
  };
}

// El cuerpo tal como lo manda Resend cuando entra un mail.
const cuerpo = JSON.stringify({
  type: 'email.received',
  data: {
    from: 'cliente@example.com',
    to: ['cotizaciones@quilmescorrugados.com.ar'],
    subject: 'Necesito 500 cajas de 40x30x20',
    text: 'Hola, necesito cotizar 500 cajas de 40x30x20 cm.',
  },
});

// Otro cuerpo, para la firma que no corresponde.
const otroCuerpo = JSON.stringify({
  type: 'email.received',
  data: { from: 'atacante@example.com', subject: 'mensaje falso', text: 'inyectado' },
});

const ID = 'msg_2abcDEFghiJKLmno';
const firmaBuena = firmarComoResend(SECRETO, ID, AHORA, cuerpo)!;

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nEl algoritmo es el de Svix, no uno nuestro');

// Calculada a mano aca: HMAC-SHA256 en base64 sobre "id.timestamp.cuerpo", con
// la clave que sale de decodificar el base64 que va despues de whsec_. Si
// alguien "simplifica" firmarComoResend usando el texto del secreto como clave
// —el error clasico— esto lo caza.
const aMano =
  'v1,' +
  crypto
    .createHmac('sha256', Buffer.from(SECRETO.slice('whsec_'.length), 'base64'))
    .update(`${ID}.${AHORA}.${cuerpo}`, 'utf8')
    .digest('base64');

verificar('coincide con el HMAC calculado aparte', firmaBuena, aMano);

// Y contra el paquete de verdad, mientras este. Es dependencia transitiva de
// resend, no nuestra, asi que si no esta se saltea en vez de romper la prueba.
try {
  const { Webhook } = await import('svix');
  const firmaDelPaquete = new Webhook(SECRETO).sign(ID, new Date(AHORA * 1000), cuerpo);
  verificar('coincide con lo que firma el paquete svix', firmaBuena, firmaDelPaquete);
} catch {
  console.log('  --   svix no esta instalado, se saltea la comparacion contra el paquete');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nLos cuatro casos que decide el webhook');

verificar('firma buena: acepta',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'valida' });

// El caso que importa: la firma es autentica, pero de OTRO cuerpo. Es lo que
// pasa si alguien captura un webhook legitimo y le cambia el contenido.
verificar('firma de otro cuerpo: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena), otroCuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// Con el secreto puesto, que no venga firma NO es "no puedo comprobarlo": es que
// el que llama no es Resend, porque Resend siempre firma. Si esto devolviera
// 'sin-con-que-comprobar', cualquiera entra simplemente omitiendo la cabecera,
// que es el agujero exacto que esto cierra.
verificar('sin cabecera de firma y con secreto: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, null), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'faltan-cabeceras' });

verificar('sin svix-id: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(null, AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'faltan-cabeceras' });

verificar('sin svix-timestamp: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, null, firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'faltan-cabeceras' });

// La valvula que mantiene vivo el canal si falta RESEND_WEBHOOK_SECRET. Si esto
// devolviera 'invalida', un despliegue sin la variable dejaria de recibir mails
// de clientes en vez de seguir atendiendo y avisar.
verificar('sin secreto configurado: no hay con que comprobar',
  verificarFirmaResend(undefined, cabeceras(ID, AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'sin-con-que-comprobar' });

verificar('secreto vacio tambien es no-hay-con-que',
  verificarFirmaResend('', cabeceras(ID, AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'sin-con-que-comprobar' });

// Pero un secreto que ESTA y no sirve es rechazo, no via libre: si un whsec_ mal
// pegado cayera en 'sin-con-que-comprobar', el endpoint quedaria abierto justo
// cuando el panel de Vercel muestra la variable cargada.
verificar('secreto ilegible: rechaza, no deja pasar',
  verificarFirmaResend('whsec_', cabeceras(ID, AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'secreto-ilegible' });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nReenvio de un mensaje viejo (replay)');

// Este es el caso que una firma valida NO cubre. El atacante no necesita el
// secreto: le alcanza con haber visto pasar un webhook legitimo y volver a
// mandarlo tal cual. Firma, id y cuerpo son autenticos; lo unico que lo delata
// es la hora.
const viejo = AHORA - TOLERANCIA_EN_SEGUNDOS - 1;
const firmaVieja = firmarComoResend(SECRETO, ID, viejo, cuerpo)!;
verificar('mensaje viejo con firma autentica: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, viejo, firmaVieja), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'timestamp-fuera-de-ventana' });

// Justo en el borde todavia entra: la tolerancia existe porque los relojes no
// coinciden al segundo y Resend reintenta.
const alBorde = AHORA - TOLERANCIA_EN_SEGUNDOS;
verificar('en el borde de la ventana: acepta',
  verificarFirmaResend(SECRETO, cabeceras(ID, alBorde, firmarComoResend(SECRETO, ID, alBorde, cuerpo)!), cuerpo, AHORA),
  { estado: 'valida' });

// Y para adelante tambien se corta: un timestamp en el futuro es un reloj
// corrido, y aceptarlo daria una ventana de reenvio de horas.
const futuro = AHORA + TOLERANCIA_EN_SEGUNDOS + 1;
verificar('timestamp en el futuro: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, futuro, firmarComoResend(SECRETO, ID, futuro, cuerpo)!), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'timestamp-fuera-de-ventana' });

verificar('timestamp que no es un numero: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, 'ayer', firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'timestamp-ilegible' });

// Un timestamp vacio no puede colarse por Number('') === 0: la cabecera vacia
// cae en "faltan cabeceras" antes de llegar a la cuenta.
verificar('timestamp vacio: rechaza por cabecera faltante',
  verificarFirmaResend(SECRETO, cabeceras(ID, '', firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'faltan-cabeceras' });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDetalles del formato de la cabecera');

// Durante una rotacion de clave, Resend manda la firma vieja y la nueva
// separadas por un espacio. Alcanza con que cierre una: si solo se mirara la
// primera, la rotacion cortaria el canal.
const deOtraClave = firmarComoResend('whsec_' + Buffer.from('otra-clave-cualquiera!!!').toString('base64'), ID, AHORA, cuerpo)!;
verificar('varias firmas, la buena segunda: acepta',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, `${deOtraClave} ${firmaBuena}`), cuerpo, AHORA),
  { estado: 'valida' });

verificar('varias firmas, ninguna cierra: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, `${deOtraClave} ${deOtraClave}`), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// Una version que no conocemos se saltea, no se acepta.
verificar('solo una firma v2 desconocida: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena.replace('v1,', 'v2,')), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// La firma buena sin el "v1," tampoco entra: el prefijo es parte del formato.
verificar('firma sin la version: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena.slice('v1,'.length)), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// timingSafeEqual explota si los largos difieren; tiene que estar contemplado.
verificar('firma de largo distinto no explota',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, 'v1,corta'), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// El secreto tambien se acepta sin el prefijo: el panel de Resend lo muestra con
// whsec_, pero alguien puede pegarlo pelado y las dos formas tienen que dar la
// misma firma, no una que no cierra nunca.
verificar('secreto sin el prefijo whsec_: misma firma',
  firmarComoResend(SECRETO.slice('whsec_'.length), ID, AHORA, cuerpo),
  firmaBuena);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nLectura de las cabeceras de una request');

const conSvix = new Request('https://x/api/email/inbound', {
  method: 'POST',
  headers: {
    'svix-id': ID,
    'svix-timestamp': String(AHORA),
    'svix-signature': firmaBuena,
  },
});
verificar('lee las svix-*', leerCabecerasDeFirma(conSvix.headers), {
  id: ID, timestamp: String(AHORA), firma: firmaBuena,
});

// Svix acepta los dos juegos de nombres y el estandar que salio de ahi usa
// webhook-*. Si Resend cambia, esto tiene que seguir entrando.
const conWebhook = new Request('https://x/api/email/inbound', {
  method: 'POST',
  headers: {
    'webhook-id': ID,
    'webhook-timestamp': String(AHORA),
    'webhook-signature': firmaBuena,
  },
});
verificar('lee tambien las webhook-*', leerCabecerasDeFirma(conWebhook.headers), {
  id: ID, timestamp: String(AHORA), firma: firmaBuena,
});

const sinNada = new Request('https://x/api/email/inbound', { method: 'POST' });
verificar('sin cabeceras da los tres en null', leerCabecerasDeFirma(sinNada.headers), {
  id: null, timestamp: null, firma: null,
});

// Y el camino completo, como lo hace el webhook: cabeceras de la request, cuerpo
// crudo, veredicto.
verificar('request completa firmada bien: acepta',
  verificarFirmaResend(SECRETO, leerCabecerasDeFirma(conSvix.headers), cuerpo, AHORA),
  { estado: 'valida' });

verificar('request completa sin firmar: rechaza',
  verificarFirmaResend(SECRETO, leerCabecerasDeFirma(sinNada.headers), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'faltan-cabeceras' });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nEl cuerpo se firma tal cual, byte por byte');

// Reserializar cambia espacios y orden de claves. Es el error mas facil de
// cometer en el webhook —parsear primero y firmar sobre el objeto— y deja el
// canal rechazando todo con el log de "el secreto esta mal".
const reserializado = JSON.stringify(JSON.parse(cuerpo), null, 2);
verificar('un cuerpo reformateado ya no cierra',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena), reserializado, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// Acentos y eñes: si en algun lado se firmara con otra codificacion, un mail en
// castellano —o sea, todos— quedaria afuera.
const conAcentos = JSON.stringify({ text: 'Cotización de cajas para envío a Quilmes, ñandú' });
verificar('cuerpo con acentos: acepta',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmarComoResend(SECRETO, ID, AHORA, conAcentos)!), conAcentos, AHORA),
  { estado: 'valida' });

// Un cambio de un solo caracter tiene que caerse.
verificar('un caracter distinto en el cuerpo: rechaza',
  verificarFirmaResend(SECRETO, cabeceras(ID, AHORA, firmaBuena), cuerpo.replace('500', '501'), AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

// El id tambien entra en la firma: reusar una firma buena con otro id no sirve.
verificar('misma firma con otro svix-id: rechaza',
  verificarFirmaResend(SECRETO, cabeceras('msg_otroDistinto', AHORA, firmaBuena), cuerpo, AHORA),
  { estado: 'invalida', motivo: 'no-cierra' });

console.log(fallos === 0 ? '\nTodo bien.\n' : `\n${fallos} fallas.\n`);
process.exit(fallos === 0 ? 0 : 1);
