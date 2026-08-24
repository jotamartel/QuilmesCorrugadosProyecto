/**
 * Vuelve a registrar el webhook de Telegram, ahora con secret_token.
 *
 * QUE RESUELVE
 *
 * /api/telegram/webhook es público —tiene que serlo, Telegram lo llama sin
 * credenciales— y hoy atiende a cualquiera que le mande un POST con la forma
 * de un update. El secret_token es la contraseña: Telegram la manda en la
 * cabecera X-Telegram-Bot-Api-Secret-Token en cada llamada, y el endpoint
 * rechaza lo que no la traiga.
 *
 * EL ORDEN IMPORTA, Y AL REVES SE PIERDEN AVISOS
 *
 *   1. Primero esto: Telegram empieza a mandar la cabecera. El endpoint
 *      todavía no la mira —sin la variable de entorno degrada a "dejar pasar,
 *      con el error en el log"— así que no se rompe nada.
 *   2. Después la variable en Vercel. Ahí el endpoint empieza a exigirla, y la
 *      cabecera ya viene.
 *
 * Al revés hay una ventana en la que el endpoint pide una cabecera que
 * Telegram todavía no manda, y los avisos del equipo se pierden en silencio.
 *
 * El secreto sale de .env.secretos-nuevos.tmp, que git ignora.
 *
 *   npx tsx scripts/registrar-webhook-telegram.mts
 *
 * OJO: es de los pocos scripts del toolkit que MODIFICAN algo afuera.
 */
import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';

for (const f of ['.env.qa.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.log('\nFalta TELEGRAM_BOT_TOKEN.');
  console.log('Bajalo con: npx vercel env pull .env.qa.tmp --environment=production\n');
  process.exit(1);
}

const ARCHIVO = '.env.secretos-nuevos.tmp';
if (!existsSync(ARCHIVO)) {
  console.log(`\nNo está ${ARCHIVO}, que es de donde sale el secreto.\n`);
  process.exit(1);
}
const secreto = dotenv.parse(readFileSync(ARCHIVO)).TELEGRAM_WEBHOOK_SECRET;
if (!secreto) {
  console.log(`\n${ARCHIVO} no tiene TELEGRAM_WEBHOOK_SECRET.\n`);
  process.exit(1);
}

// Telegram acepta 1-256 caracteres de A-Z a-z 0-9 _ -
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secreto)) {
  console.log('\nEse secreto tiene caracteres que Telegram no acepta (solo letras, números, _ y -).\n');
  process.exit(1);
}

const api = (metodo: string, params: Record<string, string> = {}) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}?${new URLSearchParams(params)}`)
    .then((r) => r.json());

console.log('');
const antes = await api('getWebhookInfo');
if (!antes.ok) {
  console.log('No se pudo leer el webhook actual:', antes.description ?? JSON.stringify(antes));
  process.exit(1);
}

const url = antes.result?.url;
if (!url) {
  console.log('No hay webhook registrado. Registralo primero desde donde corresponda.\n');
  process.exit(1);
}

console.log(`Webhook actual: ${url}`);
console.log(`Updates:        ${JSON.stringify(antes.result.allowed_updates ?? ['(todos)'])}`);
console.log('\nVolviéndolo a registrar con secret_token…');

// Se conserva la MISMA url y los MISMOS allowed_updates: setWebhook pisa todo
// lo que no se le pase, así que omitir allowed_updates volvería a suscribir a
// tipos de update que hoy no se atienden.
const r = await api('setWebhook', {
  url,
  secret_token: secreto,
  ...(antes.result.allowed_updates
    ? { allowed_updates: JSON.stringify(antes.result.allowed_updates) }
    : {}),
});

if (!r.ok) {
  console.log('\n  ✗ No se pudo:', r.description ?? JSON.stringify(r));
  process.exit(1);
}

const despues = await api('getWebhookInfo');
console.log('\n  ✓ Registrado.');
console.log(`    url:     ${despues.result?.url}`);
console.log(`    updates: ${JSON.stringify(despues.result?.allowed_updates ?? ['(todos)'])}`);
console.log('\nDesde ahora Telegram manda la cabecera en cada llamada, y el endpoint');
console.log('todavía no la exige. El paso que falta es cargar la variable en Vercel:');
console.log('\n  npx vercel env add TELEGRAM_WEBHOOK_SECRET production');
console.log('\ny redesplegar. Recién ahí el endpoint deja de aceptar POSTs de cualquiera.\n');
