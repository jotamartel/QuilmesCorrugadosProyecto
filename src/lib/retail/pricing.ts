import { RETAIL_CONFIG, type RetailConfig } from './config';
import { calculateUnfolded } from '@/lib/utils/box-calculations';

export interface PrecioResult {
  precioUnitario: number;
  subtotal: number;
  volumen: number;
  m2PerBox: number;
  totalM2: number;
  isMayorista: boolean;
}

/**
 * Calcula el precio por caja.
 * - Si el total de m² del pedido es < 3000: precio minorista (cost-plus)
 * - Si el total de m² del pedido es >= 3000: precio mayorista (m² × $/m²)
 */
export function calcularPrecioMinorista(
  largo: number,
  ancho: number,
  alto: number,
  cantidad: number,
  config: RetailConfig = RETAIL_CONFIG
): PrecioResult {

  const volumen = largo * ancho * alto; // mm³
  const { m2: m2PerBox } = calculateUnfolded(largo, ancho, alto);
  const totalM2 = m2PerBox * cantidad;
  const isMayorista = totalM2 >= config.WHOLESALE_THRESHOLD_M2;

  let precioUnitario: number;

  if (isMayorista) {
    // Precio mayorista: m² por caja × precio por m²
    precioUnitario = Math.round(m2PerBox * config.WHOLESALE_PRICE_PER_M2);
  } else {
    // Precio minorista: cost-plus
    const precioBase =
      (volumen * config.FACTOR_MATERIAL) +
      config.COSTO_BASE_FIJO +
      config.RECARGO_MANIPULACION;

    precioUnitario = Math.round(
      precioBase * (1 + config.MARGEN_MINORISTA)
    );
  }

  const subtotal = precioUnitario * cantidad;

  return { precioUnitario, subtotal, volumen, m2PerBox, totalM2, isMayorista };
}

export function formatPrecio(valor: number): string {
  return '$' + valor.toLocaleString('es-AR');
}
