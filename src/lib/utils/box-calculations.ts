/**
 * Funciones de cálculo para cajas de cartón corrugado
 * Quilmes Corrugados
 */

export interface UnfoldedDimensions {
  unfoldedWidth: number;  // mm
  unfoldedLength: number; // mm
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
  const unfoldedLength = (2 * length) + (2 * width) + 50;

  // m² por caja = (ancho × largo) / 1.000.000
  const m2Raw = (unfoldedWidth * unfoldedLength) / 1_000_000;
  const m2 = Math.round(m2Raw * 10000) / 10000; // 4 decimales

  return {
    unfoldedWidth,
    unfoldedLength,
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
 */
export const MEDIDA_MAXIMA = { largo: 2000, ancho: 2000, alto: 1500 } as const;

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
