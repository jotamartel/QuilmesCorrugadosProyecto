/**
 * Cuánto sale correr la QA del agente, antes de correrla.
 *
 * POR QUÉ EXISTE
 *
 * Correr las 12 conversaciones gasta plata de verdad, y "va a salir poco" no es
 * una respuesta. Esto mide el prompt del sistema y las herramientas con
 * count_tokens —que no se cobra— y proyecta el costo con la misma aritmética que
 * factura Anthropic, incluido el caché, que acá cambia el número por tres.
 *
 * Lo que NO puede medir es cuánto va a contestar el modelo ni cuántas
 * herramientas va a llamar en cada turno. Para eso usa rangos, y por eso el
 * resultado es una banda y no un número.
 *
 *   npx tsx scripts/estimar-qa-agente.mts
 */
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';

delete process.env.ANTHROPIC_MODEL;
for (const f of ['.env.qa.tmp', '.env.vercel.tmp', '.env.local']) {
  if (existsSync(f)) { dotenv.config({ path: f, override: true }); break; }
}

import Anthropic from '@anthropic-ai/sdk';

const { crearHerramientas } = await import('@/lib/agente/herramientas');
const { INSTRUCCIONES, POR_CANAL } = await import('@/lib/agente/index');

const MODELO = 'claude-sonnet-5';

/**
 * Precios de Sonnet 5, en dólares por millón de tokens.
 *
 * Los de introducción rigen hasta el 31/08/2026. Hoy es antes, así que son
 * estos; se dejan los dos para que el día que caduquen el número no mienta en
 * silencio.
 */
const PRECIO = {
  entrada: 2.0,          // lista: 3.00
  salida: 10.0,          // lista: 15.00
  // El caché no es un precio aparte: es un múltiplo del de entrada.
  escrituraDeCache: 2.0 * 1.25,
  lecturaDeCache: 2.0 * 0.1,
};

const ESCENARIOS = 12;
const TURNOS = 47;

const cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// El bloque que se cachea: instrucciones + herramientas. Es lo que domina el
// costo, porque viaja en CADA turno.
async function contar(canal: 'web' | 'whatsapp', mensajes: Anthropic.MessageParam[]) {
  const r = await cliente.messages.countTokens({
    model: MODELO,
    system: [{ type: 'text', text: INSTRUCCIONES + POR_CANAL[canal] }],
    tools: crearHerramientas({ canal }) as Anthropic.Tool[],
    messages: mensajes,
  });
  return r.input_tokens;
}

const soloBloqueFijo = await contar('whatsapp', [{ role: 'user', content: 'x' }]);
const conHistorial = await contar('whatsapp', [
  { role: 'user', content: 'hola, necesito 1500 cajas de 400x300x300 con logo a 2 colores' },
  { role: 'assistant', content: 'x'.repeat(1200) },
  { role: 'user', content: 'y si le pongo impresion a 3 colores?' },
]);

const historialPorTurno = Math.max(0, conHistorial - soloBloqueFijo);

console.log('');
console.log('LO QUE SE PUEDE MEDIR');
console.log(`  instrucciones + herramientas   ${soloBloqueFijo.toLocaleString('es-AR')} tokens`);
console.log(`  historial de un turno medio    ~${historialPorTurno.toLocaleString('es-AR')} tokens`);
console.log(`  escenarios / turnos            ${ESCENARIOS} / ${TURNOS}`);

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE HAY QUE SUPONER
//
// Cada turno puede disparar hasta 6 vueltas de herramientas. En la práctica la
// mayoría usa una o ninguna, y los que cotizan devuelven un JSON grande porque
// lleva las tres alternativas de catálogo ya cotizadas.
const SUPUESTOS = {
  optimista: { vueltasPorTurno: 1.2, tokensDeHerramienta: 600, salidaPorVuelta: 250 },
  probable:  { vueltasPorTurno: 1.8, tokensDeHerramienta: 1100, salidaPorVuelta: 350 },
  pesimista: { vueltasPorTurno: 3.0, tokensDeHerramienta: 1800, salidaPorVuelta: 600 },
};

function proyectar(s: typeof SUPUESTOS.probable) {
  // El bloque fijo se escribe al caché una vez por escenario y se lee en cada
  // vuelta posterior. Sin caché este número se multiplica por diez.
  const vueltas = TURNOS * s.vueltasPorTurno;
  const escrituras = ESCENARIOS;
  const lecturas = Math.max(0, vueltas - escrituras);

  const entradaVariable =
    TURNOS * historialPorTurno + vueltas * s.tokensDeHerramienta;
  const salida = vueltas * s.salidaPorVuelta;

  const usd =
    (escrituras * soloBloqueFijo * PRECIO.escrituraDeCache) / 1e6 +
    (lecturas * soloBloqueFijo * PRECIO.lecturaDeCache) / 1e6 +
    (entradaVariable * PRECIO.entrada) / 1e6 +
    (salida * PRECIO.salida) / 1e6;

  return { vueltas: Math.round(vueltas), salida: Math.round(salida), usd };
}

console.log('');
console.log('PROYECCION');
for (const [nombre, s] of Object.entries(SUPUESTOS)) {
  const p = proyectar(s);
  console.log(
    `  ${nombre.padEnd(10)} ${String(p.vueltas).padStart(3)} llamadas · ` +
    `${p.salida.toLocaleString('es-AR').padStart(7)} tokens de salida · ` +
    `US$ ${p.usd.toFixed(2)}`,
  );
}

// Y el mismo cálculo sin caché, para que se vea de dónde sale la diferencia.
const sinCache = (() => {
  const s = SUPUESTOS.probable;
  const vueltas = TURNOS * s.vueltasPorTurno;
  return (
    (vueltas * soloBloqueFijo * PRECIO.entrada) / 1e6 +
    ((TURNOS * historialPorTurno + vueltas * s.tokensDeHerramienta) * PRECIO.entrada) / 1e6 +
    (vueltas * s.salidaPorVuelta * PRECIO.salida) / 1e6
  );
})();

console.log('');
console.log(`  (el mismo caso probable SIN caché seria US$ ${sinCache.toFixed(2)})`);
console.log('');
