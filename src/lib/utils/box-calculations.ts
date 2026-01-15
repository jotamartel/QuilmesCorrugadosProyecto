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
 * Verifica si una caja es menor al tamaño mínimo (200x200x100)
 */
export function isUndersized(length: number, width: number, height: number): boolean {
  return length < 200 || width < 200 || height < 100;
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

/**
 * Genera warnings para una caja según sus características
 */
export function generateBoxWarnings(
  dimensions: BoxDimensions,
  totalM2: number,
  minimumM2: number = 3000
): string[] {
  const warnings: string[] = [];
  const { length_mm, width_mm, height_mm } = dimensions;

  if (isOversized(length_mm, width_mm, height_mm)) {
    warnings.push('La caja excede el tamaño máximo estándar (600x400x400 mm). Requiere precio especial a cotizar.');
  }

  if (!meetsMinimum(totalM2, minimumM2)) {
    const { m2 } = calculateUnfolded(length_mm, width_mm, height_mm);
    const minQty = calculateMinimumQuantity(m2, minimumM2);
    warnings.push(
      `El modelo no alcanza el mínimo recomendado de ${minimumM2.toLocaleString('es-AR')} m². Cantidad sugerida: ${minQty.toLocaleString('es-AR')} unidades.`
    );
  }

  return warnings;
}
