#!/usr/bin/env node
/**
 * Comprueba que la compuerta de middleware.ts cierra lo privado sin romper lo
 * público.
 *
 * Los dos errores posibles son igual de graves y opuestos: dejar abierta una
 * ruta con datos internos, o cerrar una que el cotizador necesita y tumbar las
 * ventas. Por eso el script verifica las dos direcciones.
 *
 * Sobre los POST: no se mandan cuerpos válidos a propósito. Un 400 de
 * validación demuestra que la request ATRAVESÓ la compuerta —que es lo único
 * que se está midiendo— sin crear un lead ni una visita de prueba en la base.
 * Lo que nunca tiene que devolver una ruta pública es 401 ni 403.
 *
 *   node scripts/verificar-acceso.mjs [https://dominio]
 */

const BASE = (process.argv[2] || 'https://www.quilmescorrugados.com.ar')
  .trim()
  .replace(/\/+$/, '');

/** Rutas que el sitio público necesita. Prohibido que devuelvan 401/403. */
const ABIERTAS = [
  ['GET', '/api/public/retail-config'],
  ['GET', '/api/public/standard-boxes'],
  ['GET', '/api/public/cities'],
  ['GET', '/api/config/pricing', 'el cotizador lee la escalera'],
  ['GET', '/api/v1/quote?length_cm=40&width_cm=40&height_cm=40&quantity=3000'],
  ['GET', '/api/box-template?length=400&width=400&height=400'],
  ['POST', '/api/public/leads', 'cuerpo invalido: se espera 400, no 401'],
  ['POST', '/api/upload', 'sin archivo: se espera 400, no 401'],
  ['POST', '/api/traffic/track', 'json roto: se espera 400, no 401'],
  ['POST', '/api/marketing/evento', 'json roto: se espera 400, no 401'],
];

/**
 * Rutas que la compuerta abre a proposito PERO que comprueban por su cuenta.
 *
 * No entran en ABIERTAS —no tienen que contestar 200 a cualquiera— ni en
 * CERRADAS —no contestan 401 de la compuerta—. Van aparte porque el resultado
 * esperado depende de si el secreto esta configurado en ese entorno, y lo unico
 * que se puede afirmar siempre es que NO son un 200 a cualquiera con el secreto
 * puesto.
 *
 * Existen porque la lista blanca de src/proxy.ts decia "agente de voz, con su
 * propia API key". El agente de voz (Retell) se saco el 24/08/2026: no se usaba.
 * Las que quedan son webhooks de proveedores, cada uno con su firma.
 */
const ABIERTAS_PERO_SE_CUIDAN_SOLAS = [
  ['POST', '/api/email/inbound', 'firma de Svix'],
  ['POST', '/api/whatsapp/webhook', 'firma del proveedor'],
  ['POST', '/api/webhooks/mercadopago', 'firma HMAC'],
  ['POST', '/api/telegram/webhook', 'secret token'],
];

/** Rutas internas. Tienen que devolver 401 o 403 sin sesión. */
const CERRADAS = [
  ['GET', '/api/retail-sales', 'datos personales de compradores'],
  ['GET', '/api/clients'],
  ['GET', '/api/orders'],
  ['GET', '/api/quotes'],
  ['GET', '/api/payments'],
  ['GET', '/api/checks'],
  ['GET', '/api/reports/sales'],
  ['GET', '/api/reports/clients'],
  ['GET', '/api/costs/profitability'],
  ['GET', '/api/costs/supplies'],
  ['GET', '/api/public-quotes', 'cotizaciones web con datos de contacto'],
  ['GET', '/api/communications'],
  ['GET', '/api/conocimiento', 'lo que el asistente le va a decir a los clientes'],
  ['GET', '/api/traffic/stats'],
  ['GET', '/api/vehicles'],
  ['GET', '/api/boxes'],
  ['GET', '/api/api-stats'],
  ['GET', '/api/config'],
  ['GET', '/api/whatsapp/conversations'],
  ['GET', '/api/marketing/conversiones-google'],
  ['POST', '/api/config/pricing', 'CAMBIA LOS PRECIOS'],
  ['POST', '/api/boxes', 'crea stock'],
  ['POST', '/api/xubio/create-invoice', 'emite facturas'],
  ['POST', '/api/arba/generate-cot', 'integracion impositiva'],
];

/**
 * Páginas del dashboard.
 *
 * La compuerta NO las cubre a propósito: eso puso el riesgo de quedarse afuera
 * del panel en la misma pieza que protege los datos, y son riesgos de tamaño
 * muy distinto. Las protege AuthGuard del lado cliente, y sin sesión son un
 * cascarón porque cada fetch que hacen contra esta API vuelve 401.
 *
 * Se verifican igual, pero al revés: tienen que RESPONDER, no bloquear. Si un
 * día devuelven 401 o 403, alguien volvió a ponerlas detrás de la compuerta.
 */
const PAGINAS = ['/inicio', '/clientes', '/ventas-retail', '/reportes', '/configuracion'];

/** Páginas públicas: no se pueden haber cerrado por accidente. */
const PAGINAS_ABIERTAS = ['/', '/precios', '/cajas', '/mayorista', '/faq', '/login'];

const UA = { 'user-agent': 'QuilmesAccessCheck/1.0' };

async function pedir(metodo, ruta, seguirRedirect = false) {
  try {
    const opciones = {
      method: metodo,
      headers: { ...UA },
      redirect: seguirRedirect ? 'follow' : 'manual',
    };
    if (metodo === 'POST') {
      // Cuerpo deliberadamente inválido: alcanza para pasar la compuerta y no
      // llega a escribir nada.
      opciones.headers['content-type'] = 'application/json';
      opciones.body = '{';
    }
    const r = await fetch(`${BASE}${ruta}`, opciones);
    return { status: r.status, location: r.headers.get('location') };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

const fallos = [];
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

console.log(`\nVerificacion de acceso — ${BASE}\n`);

console.log('PUBLICO — no puede pedir sesion\n');
for (const [metodo, ruta, nota] of ABIERTAS) {
  const { status, error } = await pedir(metodo, ruta);
  const mal = status === 401 || status === 403 || status === 0;
  if (mal) fallos.push(`${metodo} ${ruta} devolvio ${error || status}: se cerro algo que el sitio necesita`);
  console.log(`  ${mal ? 'MAL ' : 'ok  '} ${pad(`${metodo} ${ruta}`, 62)} ${error || status}${nota ? `  (${nota})` : ''}`);
}

// ESTA SECCION INFORMA, NO DICTAMINA. A PROPOSITO.
//
// Estas rutas las abre la compuerta y cada una comprueba por su cuenta. Desde
// afuera NO se puede saber si comprueban: todas degradan igual cuando les falta
// el secreto —dejan pasar y lo registran en el log— porque un despliegue al que
// se le olvido una variable no deberia dejar mudo un canal de atencion. O sea
// que un 200 aca puede significar "no comprueba nada" o "todavia no le cargaron
// el secreto", y no hay forma de distinguirlo con una request desde afuera.
//
// Se probo con un chequeo automatico de "200 = mal" y daba tres falsos
// positivos de ocho: el de WhatsApp porque el proveedor activo es Twilio, que
// esta en modo observacion a proposito, y el de MercadoPago porque con el cuerpo
// roto corta antes de llegar a la firma.
//
// Lo que si prueba cada una es su propia QA:
//   scripts/qa-firma-email.mts          la firma de Svix de Resend
//   scripts/qa-transporte-whatsapp.mts  la firma de Meta
console.log('\nABIERTAS EN LA COMPUERTA, SE CUIDAN SOLAS — informativo\n');
for (const [metodo, ruta, nota] of ABIERTAS_PERO_SE_CUIDAN_SOLAS) {
  const { status, error } = await pedir(metodo, ruta);
  console.log(`  ·    ${pad(`${metodo} ${ruta}`, 62)} ${error || status}${nota ? `  (${nota})` : ''}`);
}

console.log('\nINTERNO — tiene que pedir sesion\n');
for (const [metodo, ruta, nota] of CERRADAS) {
  const { status, error } = await pedir(metodo, ruta);
  const bien = status === 401 || status === 403;
  if (!bien) fallos.push(`${metodo} ${ruta} devolvio ${error || status} SIN CREDENCIALES — sigue expuesta`);
  console.log(`  ${bien ? 'ok  ' : 'MAL '} ${pad(`${metodo} ${ruta}`, 62)} ${error || status}${nota ? `  (${nota})` : ''}`);
}

console.log('\nPAGINAS DEL DASHBOARD — las cuida AuthGuard, no la compuerta\n');
for (const ruta of PAGINAS) {
  const { status, error } = await pedir('GET', ruta, true);
  const bien = status === 200;
  if (!bien) {
    fallos.push(
      `GET ${ruta} devolvio ${error || status}: la compuerta volvio a cubrir las paginas` +
        ' y puede dejar afuera a un usuario legitimo',
    );
  }
  console.log(`  ${bien ? 'ok  ' : 'MAL '} ${pad(ruta, 62)} ${error || status}`);
}

console.log('\nPAGINAS PUBLICAS — tienen que seguir abiertas\n');
for (const ruta of PAGINAS_ABIERTAS) {
  const { status, error } = await pedir('GET', ruta, true);
  const bien = status === 200;
  if (!bien) fallos.push(`GET ${ruta} devolvio ${error || status}: se rompio una pagina publica`);
  console.log(`  ${bien ? 'ok  ' : 'MAL '} ${pad(ruta, 62)} ${error || status}`);
}

if (fallos.length) {
  console.log(`\n${fallos.length} problema(s):\n`);
  fallos.forEach((f) => console.log(`  · ${f}`));
  console.log();
  process.exit(1);
}
console.log('\nTodo en orden: lo interno pide sesion y lo publico sigue abierto.\n');
