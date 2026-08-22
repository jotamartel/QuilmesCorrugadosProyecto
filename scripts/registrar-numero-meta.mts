/**
 * Registra el número en la Cloud API, y si falla dice POR QUÉ.
 *
 * POR QUÉ EXISTE
 *
 * El botón "Registrar" de la consola de Meta, cuando falla, dice "Se produjo un
 * error durante el registro. Vuelve a intentarlo." y nada más. El mismo llamado
 * hecho contra la API devuelve el motivo concreto: que el número todavía tiene
 * WhatsApp activo, que el PIN no coincide con uno anterior, que la cuenta está
 * bloqueada por el método de pago, o que se agotaron los intentos.
 *
 * Esto hace exactamente lo mismo que ese botón —POST /{phone_number_id}/register—
 * y imprime la respuesta entera.
 *
 * EL PIN NO SE GUARDA EN NINGÚN LADO
 *
 * Se pasa por argumento y se usa una vez. No va a un archivo, ni a una variable
 * de entorno, ni queda en el repositorio. Es el PIN de verificación en dos pasos
 * del número: Meta lo vuelve a pedir si algún día hay que registrar esa línea de
 * nuevo, así que va en el gestor de contraseñas y en ningún otro lugar.
 *
 *   npx tsx scripts/registrar-numero-meta.mts 123456
 *
 * OJO: esta es la ÚNICA cosa de todo el toolkit que modifica algo en Meta. Las
 * demás solo leen.
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';

for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { VERSION_DE_GRAPH: VERSION } = await import('@/lib/whatsapp-transporte/meta');

const TOKEN = process.env.META_WA_TOKEN;
const PHONE_ID = process.env.META_WA_PHONE_NUMBER_ID;
const pin = (process.argv[2] || '').trim();

if (!TOKEN || !PHONE_ID) {
  console.log('\nFaltan META_WA_TOKEN o META_WA_PHONE_NUMBER_ID.');
  console.log('Bajalas con: npx vercel env pull .env.qa.tmp --environment=production\n');
  process.exit(1);
}

if (!/^\d{6}$/.test(pin)) {
  console.log('\nPasá el PIN de 6 dígitos como argumento:');
  console.log('  npx tsx scripts/registrar-numero-meta.mts 123456');
  console.log('\nEs el PIN que elegiste vos al registrar el número, no un código que manda Meta.\n');
  process.exit(1);
}

console.log('');
console.log(`Registrando ${PHONE_ID} en la Cloud API…`);

const r = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/register`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
});

const datos = await r.json().catch(() => ({}));

if (r.ok && datos.success) {
  console.log('\n  ✓ Registrado.');
  console.log('\nComprobalo con: npx tsx scripts/verificar-meta.mts');
  console.log('El número tiene que pasar de PENDING a CONNECTED.\n');
  process.exit(0);
}

const e = (datos.error as Record<string, unknown>) || {};
console.log('\n  ✗ No se pudo registrar. Lo que dice Meta, textual:\n');
console.log(`  ${e.message || JSON.stringify(datos)}`);
if (e.error_user_title) console.log(`  ${e.error_user_title}`);
if (e.error_user_msg) console.log(`  ${e.error_user_msg}`);
if (e.error_subcode) console.log(`  (subcódigo ${e.error_subcode})`);
console.log('');

// Los que más aparecen en este paso, traducidos a qué hacer.
const conocidos: Array<[RegExp, string]> = [
  [/two.?step|pin/i,
   'El PIN no coincide con uno que ese número ya tenía. Si la línea tuvo verificación en dos pasos en WhatsApp, hay que usar ESE PIN, o esperar 7 días para poder cambiarlo.'],
  [/already.?(registered|exists)|in use/i,
   'El número figura registrado en otra cuenta de WhatsApp Business. Hay que darlo de baja de allá primero.'],
  [/payment/i,
   'Es el método de pago de la cuenta. Cargalo en Paso 2 → "Agrega la información de pago".'],
  [/rate.?limit|too many|attempts/i,
   'Se agotaron los intentos. Esperá unas horas antes de volver a probar: reintentar seguido alarga la espera.'],
  [/verif/i,
   'El número no completó la verificación por SMS o llamada. Volvé a "Verificar número".'],
];
const pista = conocidos.find(([re]) => re.test(String(e.message || '') + String(e.error_user_msg || '')));
if (pista) console.log(`  → ${pista[1]}\n`);

process.exit(1);
