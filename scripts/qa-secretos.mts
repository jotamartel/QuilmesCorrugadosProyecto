/**
 * Que no se escape una credencial a un repositorio PUBLICO.
 *
 * POR QUE
 *
 * github.com/jotamartel/QuilmesCorrugadosProyecto es publico: cualquiera lo
 * clona, y los bots que buscan claves de Supabase y OpenAI en GitHub son
 * rapidos y conocidos. Un secreto commiteado no se arregla borrandolo despues
 * —queda en el historial para siempre— y la unica salida real es rotar la
 * clave, avisarle a quien corresponda y vivir con la duda de si alguien la uso.
 *
 * Hoy el arbol y los 219 commits estan limpios: lo que parecia una filtracion
 * eran placeholders ("eyJhbGci...", "TU_PASSWORD", "xxxxx.supabase.co"). Este
 * script existe para que siga asi, y para que la proxima vez que alguien
 * escriba una clave en un archivo se entere ANTES de pushear.
 *
 * QUE NO HACE: no revisa el historial en cada corrida —seria lento y no
 * cambia—. Revisa lo que hay ahora, que es lo que se puede evitar.
 *
 *   npx tsx scripts/qa-secretos.mts
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let fallos = 0;
function ok(nombre: string, condicion: boolean, detalle = '') {
  if (condicion) console.log(`  ok   ${nombre}`);
  else { fallos++; console.log(`  FALLA ${nombre}${detalle ? `\n        ${detalle}` : ''}`); }
}

/**
 * Los patrones de cada proveedor que usa el sistema.
 *
 * Cada uno pide una longitud minima que un placeholder no alcanza: la gracia
 * es que "sk-ant-..." escrito como ejemplo en un documento no dispare la
 * alarma, porque una QA que grita en falso se termina ignorando.
 */
const PATRONES: Array<[string, RegExp]> = [
  ['JWT de Supabase', /eyJ[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{40,}/],
  ['Anthropic', /sk-ant-[A-Za-z0-9_-]{40,}/],
  ['OpenAI', /sk-(?:proj-)?[A-Za-z0-9]{40,}/],
  ['Groq', /gsk_[A-Za-z0-9]{40,}/],
  ['Resend', /re_[A-Za-z0-9]{10,}_[A-Za-z0-9]{20,}/],
  ['Twilio', /SK[0-9a-f]{32}/],
  ['Meta / WhatsApp', /EAA[A-Za-z0-9]{100,}/],
  ['Retell', /key_[a-f0-9]{28,}/],
  ['MercadoPago', /APP_USR-[0-9a-f]{8}-[0-9a-f-]{20,}/],
  ['Secreto de webhook', /whsec_[A-Za-z0-9+/=]{24,}/],
  ['Contraseña de Postgres', /postgres(?:ql)?:\/\/[^:\s]+:(?!TU_|<|\$|\[|\*\*\*)[^@\s]{8,}@/],
];

const archivos = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 50e6 })
  .split('\n')
  .filter(Boolean)
  // Los binarios no se leen como texto y el propio script tiene los patrones.
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i.test(f))
  .filter((f) => f !== 'scripts/qa-secretos.mts');

console.log('');
console.log(`Los ${archivos.length} archivos versionados, contra ${PATRONES.length} patrones`);

const encontrados: string[] = [];
for (const archivo of archivos) {
  let texto: string;
  try { texto = readFileSync(archivo, 'utf8'); } catch { continue; }
  for (const [nombre, patron] of PATRONES) {
    const m = texto.match(patron);
    if (m) encontrados.push(`${archivo} → ${nombre}: ${m[0].slice(0, 12)}…`);
  }
}

ok('ningún secreto en los archivos versionados', encontrados.length === 0,
   encontrados.join('\n        '));

console.log('');
console.log('Y que los .env no se puedan commitear por accidente');
{
  const ignore = readFileSync('.gitignore', 'utf8');
  ok('.gitignore cubre .env*', /^\.env\*/m.test(ignore));

  const versionados = archivos.filter((f) => /(^|\/)\.env($|\.)/.test(f));
  ok('ningún .env versionado', versionados.length === 0, versionados.join(', '));

  // git check-ignore devuelve 0 si el archivo está ignorado.
  const cubiertos = ['.env.local', '.env.qa.tmp', '.env.vercel.tmp'].every((f) => {
    try { execSync(`git check-ignore -q ${f}`); return true; } catch { return false; }
  });
  ok('los .env que se usan a diario están ignorados', cubiertos);
}

console.log('');
console.log(fallos === 0 ? 'Todo bien.' : `${fallos} fallas.`);
console.log('');
process.exit(fallos === 0 ? 0 : 1);
