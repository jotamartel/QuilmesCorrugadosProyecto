/**
 * Funciones de cálculo para cajas de cartón corrugado
 * Quilmes Corrugados
 */

/**
 * El largo máximo de una plancha de cartón: 2.050 mm.
 *
 * Una caja cuyo desarrollo de una pieza (2·(L+A)+50) se pasa de esto no se
 * rechaza: se fabrica en DOS MITADES que se pegan. Cada mitad lleva su propia
 * solapa de pegado de 50 mm —por eso el material suma 100 mm en vez de 50— y
 * el pegado extra tiene mano de obra: el precio de esas cajas lleva el
 * recargo de RECARGO_DOS_MITADES. Regla confirmada por la fábrica el
 * 27-08-2026, con ejemplo: 600x400x400 da 2.050 justo y va de una pieza;
 * 600x500x500 da 2.250, va en dos mitades de 1.150 mm.
 *
 * Como máximo se unen DOS planchas: cada mitad (L+A+50) también tiene que
 * entrar en los 2.050 mm, o sea largo+ancho ≤ 2.000. No hay caja de tres
 * planchas.
 */
export const LARGO_MAXIMO_PLANCHA = 2050;

/** Recargo sobre el precio del material de una caja en dos mitades (pegado + mano de obra). */
export const RECARGO_DOS_MITADES = 0.25;

export interface UnfoldedDimensions {
  unfoldedWidth: number;  // mm
  /** Largo de CADA plancha: el desarrollo completo si va de una pieza, la mitad si va en dos. */
  unfoldedLength: number; // mm
  /** 1 = una plancha; 2 = dos mitades pegadas (el precio lleva RECARGO_DOS_MITADES). */
  pieces: 1 | 2;
  m2: number;
}

export interface BoxDimensions {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

/**
 * Cálculo de plancha para cajas RSC (Regular Slotted Container) con aletas simples.
 *
 * Estructura de la plancha:
 * - Ancho: Medio ancho / Alto / Medio ancho (trazado)
 * - Largo: Ancho / Largo / Ancho / Largo / Chapetón
 *
 * El chapetón y refile suman 50mm al largo total.
 *
 * Fórmulas:
 * - Ancho plancha = H + A (Alto + Ancho)
 * - Largo plancha = 2L + 2A + 50 (2 Largos + 2 Anchos + chapetón/refile)
 * - m² = (Ancho × Largo) / 1.000.000
 *
 * Ejemplo: Caja 600x400x400 = 800mm x 2050mm = 1.64 m²
 *
 * @param length Largo de la caja en mm (L)
 * @param width Ancho de la caja en mm (A)
 * @param height Alto de la caja en mm (H)
 * @returns Dimensiones desplegadas y m² por caja
 */
export function calculateUnfolded(
  length: number,
  width: number,
  height: number
): UnfoldedDimensions {
  // Ancho de plancha = Alto + Ancho
  const unfoldedWidth = height + width;

  // Largo de plancha = 2 Largos + 2 Anchos + 50mm (chapetón y refile)
  const unaPieza = (2 * length) + (2 * width) + 50;

  // Si el desarrollo de una pieza no entra en el largo máximo de plancha, la
  // caja se hace en dos mitades: cada una es medio perímetro con SU solapa de
  // 50 (L+A+50). El material total pasa de 2(L+A)+50 a 2(L+A)+100 — la
  // solapa extra es real y se cobra; el 25% del pegado lo aplica el motor.
  const pieces: 1 | 2 = unaPieza <= LARGO_MAXIMO_PLANCHA ? 1 : 2;
  const unfoldedLength = pieces === 1 ? unaPieza : length + width + 50;

  // m² por caja = material de TODAS las planchas / 1.000.000
  const m2Raw = (pieces * unfoldedWidth * unfoldedLength) / 1_000_000;
  const m2 = Math.round(m2Raw * 10000) / 10000; // 4 decimales

  return {
    unfoldedWidth,
    unfoldedLength,
    pieces,
    m2,
  };
}

/**
 * Verifica si una caja excede el tamaño máximo estándar (600x400x400)
 * Las cajas sobredimensionadas requieren cotización especial
 */
export function isOversized(length: number, width: number, height: number): boolean {
  return length > 600 || width > 400 || height > 400;
}

/**
 * La medida mas chica que la fabrica puede producir.
 *
 * Este es el dato autoritativo. Estaba escrito aca y ademas, con otros valores
 * —100x100x50—, en RETAIL_CONFIG. Los dos se usaban: esta version validaba el
 * alta de cajas en el catalogo, y la de RETAIL_CONFIG validaba la API del
 * cotizador minorista y los deslizadores del configurador.
 *
 * O sea que el cotizador aceptaba pedidos de cajas que la fabrica no fabrica, y
 * el asistente, que leia de ahi, le informo a un cliente que la medida minima
 * era 100x100x50. Ahora RETAIL_CONFIG toma estos valores.
 */
export const MEDIDA_MINIMA = { largo: 200, ancho: 200, alto: 100 } as const;

/**
 * La medida más grande que la fábrica puede producir.
 *
 * OJO, NO CONFUNDIR con isOversized() de más arriba, que suena igual y dice
 * otra cosa: aquella pregunta si la caja se pasa del tamaño estándar de
 * catálogo —600x400x400— y por eso necesita cotización aparte. Ésta pregunta
 * si la máquina directamente no la hace. Una caja de 700x500x500 es
 * "oversized" y se fabrica todos los días.
 *
 * Estaba escrita a mano adentro de validarCajas() y en ningún otro lado, así
 * que el motor de cotización no la conocía: una caja de 2500x900x400 la
 * rechazaba la API pública —que sí valida— pero salía cotizada por la
 * herramienta del agente, que no.
 *
 * Los topes por eje SALEN de los límites de plancha, no son caprichos:
 * - largo: 1800 = 2000 (largo+ancho máx en dos mitades) − 200 (ancho mínimo)
 * - ancho: 1100 = 1200 (rollo, ancho+alto) − 100 (alto mínimo)
 * - alto:  1000 = 1200 (rollo) − 200 (ancho mínimo)
 * Son techos ALCANZABLES solo con la otra medida en el mínimo: la regla real
 * es combinada (largo+ancho ≤ 2000 y ancho+alto ≤ 1200) y vive en
 * porQueNoSeFabrica() del motor. Los valores viejos (2000x2000x1500) eran
 * imposibles hasta de a pares y hacían prometer cajas infabricables.
 */
export const MEDIDA_MAXIMA = { largo: 1800, ancho: 1100, alto: 1000 } as const;

export function excedeMedidaMaxima(length: number, width: number, height: number): boolean {
  return (
    length > MEDIDA_MAXIMA.largo ||
    width > MEDIDA_MAXIMA.ancho ||
    height > MEDIDA_MAXIMA.alto
  );
}

export function isUndersized(length: number, width: number, height: number): boolean {
  return (
    length < MEDIDA_MINIMA.largo ||
    width < MEDIDA_MINIMA.ancho ||
    height < MEDIDA_MINIMA.alto
  );
}

/**
 * Calcula la cantidad mínima de cajas para alcanzar los m² mínimos por modelo
 * @param m2PerBox m² por caja individual
 * @param minimumM2 m² mínimos por modelo (default: 3000)
 * @returns Cantidad mínima de cajas requeridas
 */
export function calculateMinimumQuantity(
  m2PerBox: number,
  minimumM2: number = 3000
): number {
  return Math.ceil(minimumM2 / m2PerBox);
}

/**
 * Calcula el total de m² para una cantidad de cajas
 * @param m2PerBox m² por caja
 * @param quantity Cantidad de cajas
 * @returns Total de m² (4 decimales)
 */
export function calculateTotalM2(m2PerBox: number, quantity: number): number {
  const total = m2PerBox * quantity;
  return Math.round(total * 10000) / 10000;
}

/**
 * Verifica si la cantidad cumple con el mínimo recomendado
 */
export function meetsMinimum(totalM2: number, minimumM2: number = 3000): boolean {
  return totalM2 >= minimumM2;
}

/**
 * Valida las dimensiones de una caja
 * @returns Array de errores de validación (vacío si es válida)
 */
export function validateBoxDimensions(
  length: number,
  width: number,
  height: number
): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(length) || length <= 0) {
    errors.push('El largo debe ser un número entero positivo en mm');
  }
  if (!Number.isInteger(width) || width <= 0) {
    errors.push('El ancho debe ser un número entero positivo en mm');
  }
  if (!Number.isInteger(height) || height <= 0) {
    errors.push('El alto debe ser un número entero positivo en mm');
  }

  if (errors.length === 0) {
    if (isUndersized(length, width, height)) {
      errors.push(`La caja es menor al tamaño mínimo permitido (200x200x100 mm)`);
    }
  }

  return errors;
}

// generateBoxWarnings se borro el 20/08/2026. No la llamaba nadie y traia
// cableado un "minimo recomendado" de 3.000 m² que ya no es un minimo de nada:
// el piso de venta son 500 m² y la produccion a medida arranca en 1.000. Si
// vuelve a hacer falta un texto de advertencia, sale de motor.ts, que es donde
// vive la regla, no de un default de parametro.
