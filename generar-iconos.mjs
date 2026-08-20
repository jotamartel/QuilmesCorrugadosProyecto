/**
 * Genera los dos iconos cuadrados que pide el portal de plugins de OpenAI, a
 * partir del isotipo que ya vive en public/logo.svg.
 *
 * El logo del sitio es apaisado —isotipo a la izquierda, palabra a la derecha—
 * y el portal pide PNG CUADRADO. Los dos poligonos del isotipo ocupan un area
 * cuadrada de 0 a ~4355 en los dos ejes, asi que alcanza con recortar el
 * viewBox: no hay que redibujar nada ni inventar una marca nueva.
 *
 * Va con margen y fondo blanco. Se probo una variante de fondo oscuro para el
 * modo oscuro del directorio y se descarto: el azul marino de la marca sobre
 * fondo oscuro casi no se ve. Un icono que trae su propio fondo blanco se lee
 * sobre cualquier cosa, y el portal pide dos archivos, no cuatro.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const AZUL = '#002E55';
const CELESTE = '#4F6D87';

const svg = fs.readFileSync('public/logo.svg', 'utf8');

// Los dos poligonos del isotipo, tal cual estan en el archivo original.
const poligonos = [...svg.matchAll(/<polygon[^>]*class="(fil0|fil1)"[^>]*points="([^"]+)"[^>]*\/>/g)];
if (poligonos.length !== 2) {
  console.error('Se esperaban 2 poligonos del isotipo y se encontraron', poligonos.length);
  process.exit(1);
}

// Caja real del isotipo, medida sobre los puntos y no asumida.
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [, , puntos] of poligonos) {
  for (const par of puntos.trim().split(/\s+/)) {
    const [x, y] = par.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
}

const ancho = maxX - minX;
const alto = maxY - minY;
const lado = Math.max(ancho, alto);
const margen = lado * 0.16;
const total = lado + margen * 2;
// Centrado dentro del cuadrado, por si el isotipo no es exactamente cuadrado.
const x0 = minX - margen - (lado - ancho) / 2;
const y0 = minY - margen - (lado - alto) / 2;

console.log(`isotipo: ${Math.round(ancho)} x ${Math.round(alto)} unidades`);
console.log(`lienzo:  ${Math.round(total)} x ${Math.round(total)} con ${Math.round(margen)} de margen`);

const cuerpo = poligonos
  .map(([, clase, puntos]) => `<polygon fill="${clase === 'fil0' ? AZUL : CELESTE}" points="${puntos}"/>`)
  .join('\n  ');

const armar = (fondo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${total} ${total}">
  <rect x="${x0}" y="${y0}" width="${total}" height="${total}" fill="${fondo}"/>
  ${cuerpo}
</svg>`;

const salidas = [
  ['public/icono-directorio-256.png', 256, '#ffffff'],
  ['public/icono-composer-48.png', 48, '#ffffff'],
];

for (const [ruta, px, fondo] of salidas) {
  await sharp(Buffer.from(armar(fondo)))
    .resize(px, px)
    .png()
    .toFile(ruta);
  const { size } = fs.statSync(ruta);
  console.log(`  ${ruta}  ${px}x${px}  ${(size / 1024).toFixed(1)} KB`);
}
