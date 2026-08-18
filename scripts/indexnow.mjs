#!/usr/bin/env node
/**
 * Avisa a Bing —y por lo tanto a ChatGPT— que hay paginas nuevas o cambiadas.
 *
 * POR QUE ESTO Y NO SEARCH CONSOLE
 *
 * ChatGPT Search no tiene indice propio de paginas: recupera desde el indice
 * de Bing y despues cita con OAI-SearchBot. Google Search Console no mueve esa
 * aguja. Una pagina que no esta en Bing es invisible para ChatGPT y para
 * Copilot por mas que rankee bien en Google.
 *
 * IndexNow es el mecanismo de Bing para forzar el recrawl: se publica una
 * clave en el dominio y se le mandan las URLs. En vez de esperar dias a que
 * pase el crawler, el recrawl arranca en minutos.
 *
 * Esto no garantiza que ChatGPT nos cite —eso depende de que seamos la mejor
 * respuesta— pero saca del medio el problema de que ni siquiera nos vea.
 *
 *   node scripts/indexnow.mjs              (las paginas que importan)
 *   node scripts/indexnow.mjs /precios     (una en particular)
 */

import fs from 'fs';
import path from 'path';

const HOST = 'www.quilmescorrugados.com.ar';
const BASE = `https://${HOST}`;

/**
 * La clave vive como archivo en public/ porque IndexNow verifica que el dominio
 * es nuestro pidiendo https://HOST/<clave>.txt y esperando la clave adentro.
 * Se lee de ahi para que no exista una segunda copia que se pueda desincronizar.
 */
function leerClave() {
  const dir = path.join(process.cwd(), 'public');
  const archivo = fs
    .readdirSync(dir)
    .find((f) => /^[a-f0-9]{16,64}\.txt$/.test(f));
  if (!archivo) {
    console.error('No hay archivo de clave IndexNow en public/. Generá uno con:');
    console.error('  node -e "const k=require(\'crypto\').randomBytes(16).toString(\'hex\');require(\'fs\').writeFileSync(`public/${k}.txt`,k);console.log(k)"');
    process.exit(1);
  }
  return fs.readFileSync(path.join(dir, archivo), 'utf8').trim();
}

/**
 * Las paginas que vale la pena empujar.
 *
 * Deliberadamente NO son las 12 del sitemap. IndexNow premia el uso mesurado:
 * mandar todo cada vez es ruido. Estas son las que cargan el dato que un
 * asistente necesita para responder con numeros en vez de mandar a llamar.
 */
const PRIORITARIAS = [
  '/precios',   // la escalera completa en HTML: es LA pagina que faltaba indexada
  '/llms.txt',  // como cotizar por API
  '/',
  '/cajas',
  '/mayorista',
  '/api/v1/docs',
];

const rutas = process.argv.slice(2).length ? process.argv.slice(2) : PRIORITARIAS;
const clave = leerClave();
const urlList = rutas.map((r) => `${BASE}${r.startsWith('/') ? r : `/${r}`}`);

console.log(`\nIndexNow — ${HOST}`);
console.log(`clave: ${clave.slice(0, 8)}...  (verificable en ${BASE}/${clave}.txt)\n`);

// Antes de avisar, comprobar que la clave se sirve: si no, Bing rechaza todo.
const verif = await fetch(`${BASE}/${clave}.txt`);
const contenido = verif.ok ? (await verif.text()).trim() : '';
if (contenido !== clave) {
  console.error(`La clave no se sirve todavía en ${BASE}/${clave}.txt`);
  console.error(`  status ${verif.status}, contenido "${contenido.slice(0, 40)}"`);
  console.error('  Deployá primero: el archivo tiene que estar publicado.');
  process.exit(1);
}
console.log('clave verificada en el dominio\n');

urlList.forEach((u) => console.log('  ' + u));

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: clave, keyLocation: `${BASE}/${clave}.txt`, urlList }),
});

console.log(`\nrespuesta de IndexNow: HTTP ${res.status}`);
// 200 = aceptado, 202 = aceptado y pendiente de validar la clave.
if (res.status === 200 || res.status === 202) {
  console.log('Enviado. Bing recrawlea en minutos u horas; ChatGPT lee de ahí.\n');
} else {
  console.log(`  ${(await res.text()).slice(0, 300)}\n`);
  process.exit(1);
}
