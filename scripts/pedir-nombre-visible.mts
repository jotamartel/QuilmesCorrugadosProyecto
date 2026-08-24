/**
 * Manda a revisión el nombre que ven los clientes arriba del chat.
 *
 * QUE ES EL NOMBRE VISIBLE
 *
 * Es lo que WhatsApp muestra como remitente. Sin él aprobado, a quien le
 * escribimos ve el número pelado —+54 9 11 3341-1781— y tiene que adivinar
 * quién le habla. Con un aviso automático de un pedido, adivinar es
 * exactamente lo que no queremos: un mensaje de un número desconocido pidiendo
 * que transfieras plata se parece demasiado a una estafa.
 *
 * POR QUE NO ALCANZA CON ESCRIBIRLO
 *
 * El nombre puede estar cargado en la cuenta y aun así no mostrarse: son dos
 * cosas distintas. Lo que decide es name_status:
 *
 *   NON_EXISTS  cargado pero nunca pedido, o rechazado. El cliente ve el número.
 *   PENDING_REVIEW  Meta lo está revisando.
 *   APPROVED    aprobado: recién ahí el cliente ve el nombre.
 *   DECLINED    lo rechazaron; hay que cambiarlo y volver a pedir.
 *
 * Este script hace el pedido. Meta revisa que el nombre se corresponda con el
 * negocio —tiene que coincidir con la razón social o la marca, no puede ser
 * genérico ni una descripción— y tarda de horas a días.
 *
 *   npx tsx scripts/pedir-nombre-visible.mts "Quilmes Corrugados"
 *
 * OJO: junto con registrar-numero-meta.mts, es de las dos únicas cosas del
 * toolkit que MODIFICAN algo en Meta. Las demás solo leen.
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';

for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

const { VERSION_DE_GRAPH } = await import('@/lib/whatsapp-transporte/meta');

const TOKEN = process.env.META_WA_TOKEN;
const PHONE_ID = process.env.META_WA_PHONE_NUMBER_ID;
const nombre = (process.argv[2] || '').trim();

if (!TOKEN || !PHONE_ID) {
  console.log('\nFaltan META_WA_TOKEN o META_WA_PHONE_NUMBER_ID.');
  console.log('Bajalas con: npx vercel env pull .env.qa.tmp --environment=production\n');
  process.exit(1);
}

if (!nombre) {
  console.log('\nPasá el nombre entre comillas:');
  console.log('  npx tsx scripts/pedir-nombre-visible.mts "Quilmes Corrugados"\n');
  process.exit(1);
}

const graph = async (ruta: string, init?: RequestInit) => {
  const r = await fetch(`https://graph.facebook.com/${VERSION_DE_GRAPH}/${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  return { ok: r.ok, datos: await r.json().catch(() => ({})) };
};

const CAMPOS = 'display_phone_number,verified_name,name_status,new_name_status,status';

console.log('');
const antes = await graph(`${PHONE_ID}?fields=${CAMPOS}`);
if (!antes.ok) {
  console.log('No se pudo leer el número:', antes.datos?.error?.message ?? JSON.stringify(antes.datos));
  process.exit(1);
}

console.log(`Número:          ${antes.datos.display_phone_number}`);
console.log(`Nombre cargado:  ${antes.datos.verified_name}`);
console.log(`Estado:          ${antes.datos.name_status}`);
console.log(`Pedido en curso: ${antes.datos.new_name_status}`);

if (antes.datos.name_status === 'APPROVED' && antes.datos.verified_name === nombre) {
  console.log(`\n  ✓ "${nombre}" ya está aprobado. Los clientes lo ven arriba del chat.\n`);
  process.exit(0);
}

if (antes.datos.new_name_status === 'PENDING_REVIEW') {
  console.log('\n  · Ya hay un pedido esperando revisión. Volver a mandarlo no lo acelera.');
  console.log('    Comprobalo más tarde con: npx tsx scripts/verificar-meta.mts\n');
  process.exit(0);
}

console.log(`\nPidiendo que aprueben "${nombre}"…`);

const r = await graph(PHONE_ID, {
  method: 'POST',
  body: JSON.stringify({ new_display_name: nombre }),
});

if (r.ok && (r.datos.success === true || r.datos.id)) {
  console.log('\n  ✓ Pedido enviado. Meta lo revisa: tarda de horas a días.');
  console.log('\nComprobalo con: npx tsx scripts/verificar-meta.mts');
  console.log('El nombre pasa a PENDING_REVIEW y después a APPROVED.\n');
  process.exit(0);
}

const e = (r.datos.error as Record<string, unknown>) || {};
console.log('\n  ✗ No se pudo. Lo que dice Meta, textual:\n');
console.log(`  ${e.message ?? JSON.stringify(r.datos)}`);
if (e.error_user_title) console.log(`  ${e.error_user_title}`);
if (e.error_user_msg) console.log(`  ${e.error_user_msg}`);

// Los que más aparecen en este paso, traducidos a qué hacer.
const conocidos: Array<[RegExp, string]> = [
  [/guideline|policy|not compliant|no cumple/i,
   'El nombre no pasa las reglas de Meta: tiene que corresponderse con el negocio ' +
   '(la razón social o la marca), no puede ser genérico ni una descripción, ni llevar ' +
   'la URL o el rubro. "Quilmes Corrugados" debería pasar; si rebota, probá con la ' +
   'razón social completa.'],
  [/permission|scope|autoriz/i,
   'Al token le falta permiso sobre el número. Se pide desde el Administrador de ' +
   'WhatsApp, con un usuario que administre la cuenta.'],
  [/rate.?limit|too many|attempts/i,
   'Se agotaron los intentos por ahora. Esperá unas horas: reintentar seguido alarga ' +
   'la espera.'],
  [/verif/i,
   'El número todavía no completó su verificación. Revisá que status sea CONNECTED.'],
];
const pista = conocidos.find(([re]) => re.test(`${e.message ?? ''} ${e.error_user_msg ?? ''}`));
if (pista) console.log(`\n  → ${pista[1]}`);

console.log('\nSi la API no lo deja, se puede hacer a mano en el Administrador de WhatsApp:');
console.log('  Configuración de la cuenta → Números de teléfono → tu número → Perfil → Nombre para mostrar\n');
process.exit(1);
