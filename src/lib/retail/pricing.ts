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
 * - Si el total de m² del pedido es >= WHOLESALE_THRESHOLD_M2 (1000): precio mayorista (m² × $/m² mayorista)
 * - Si el total de m² del pedido es < WHOLESALE_THRESHOLD_M2: precio minorista (m² × $/m² minorista)
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
    // Precio mayorista: m² por caja × precio por m² mayorista
    precioUnitario = Math.round(m2PerBox * config.WHOLESALE_PRICE_PER_M2);
  } else {
    // Precio minorista: m² por caja × precio por m² minorista
    precioUnitario = Math.round(m2PerBox * config.RETAIL_PRICE_PER_M2);
  }

  const subtotal = precioUnitario * cantidad;

  return { precioUnitario, subtotal, volumen, m2PerBox, totalM2, isMayorista };
}

export function formatPrecio(valor: number): string {
  return '$' + valor.toLocaleString('es-AR');
}
