/**
 * Tests del CLI contra la API real (solo lectura: cotizar no crea nada).
 *
 *   npm test               # dentro de cli/, usa producción
 *   QUILMES_API_URL=http://localhost:3000 npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ejecutar = promisify(execFile);
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'quilmes-corrugados.js');

async function cli(...args) {
  try {
    const { stdout, stderr } = await ejecutar(process.execPath, [BIN, ...args]);
    return { codigo: 0, stdout, stderr };
  } catch (err) {
    return { codigo: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('sin argumentos imprime la ayuda y falla', async () => {
  const r = await cli();
  assert.equal(r.codigo, 1);
  assert.match(r.stderr, /USO/);
});

test('medidas mal escritas fallan con mensaje claro', async () => {
  const r = await cli('cotizar', '400-300-300', '1000');
  assert.equal(r.codigo, 1);
  assert.match(r.stderr, /LARGOxANCHOxALTO/);
});

test('cotizar devuelve un precio real', async () => {
  const r = await cli('cotizar', '400x600x600', '3000', '--json');
  assert.equal(r.codigo, 0, r.stderr);
  const datos = JSON.parse(r.stdout);
  assert.equal(datos.success, true);
  assert.equal(datos.quote.cotizable, true);
  assert.equal(typeof datos.quote.subtotal, 'number');
  assert.equal(datos.quote.boxes[0].length_mm, 400);
});

test('el sufijo cm convierte a milímetros', async () => {
  const r = await cli('cotizar', '40x60x60cm', '3000', '--json');
  assert.equal(r.codigo, 0, r.stderr);
  const datos = JSON.parse(r.stdout);
  assert.equal(datos.quote.boxes[0].length_mm, 400);
  assert.equal(datos.quote.boxes[0].width_mm, 600);
});

test('un pedido sin precio sale con código 2 y explica', async () => {
  // Medida fuera de catálogo por debajo del mínimo a medida: sin precio, por diseño.
  const r = await cli('cotizar', '400x300x200', '690');
  assert.equal(r.codigo, 2, `codigo ${r.codigo}: ${r.stderr}`);
  assert.match(r.stdout, /catálogo|m²/);
});

test('precios imprime la escalera vigente', async () => {
  const r = await cli('precios');
  assert.equal(r.codigo, 0, r.stderr);
  assert.match(r.stdout, /\$/);
  assert.match(r.stdout, /m²/);
});

test('plantilla descarga un PDF', async () => {
  const destino = join(tmpdir(), `plantilla-test-${process.pid}.pdf`);
  try {
    const r = await cli('plantilla', '400x300x300', '-o', destino);
    assert.equal(r.codigo, 0, r.stderr);
    assert.ok(existsSync(destino));
    assert.equal(readFileSync(destino).subarray(0, 4).toString(), '%PDF');
  } finally {
    rmSync(destino, { force: true });
  }
});
