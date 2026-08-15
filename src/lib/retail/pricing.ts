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
 * Precio de una caja vendida de stock por /cajas.
 *
 * Es un precio único: este canal vende medidas estándar que ya están en
 * depósito, y su tope es WHOLESALE_THRESHOLD_M2. Pasado ese volumen el pedido
 * ya no sale de stock sino de producción a medida, y se deriva al cotizador
 * mayorista, que tiene su propia escalera (ver lib/utils/pricing.ts).
 *
 * Antes esta función aplicaba precio mayorista por encima del umbral. Eso hacía
 * que el mismo pedido saliera más barato acá que por el cotizador principal
 * —hasta $479.840 de diferencia en 2.999 m²—. Ahora los dos canales no se
 * superponen y cada volumen tiene un solo precio posible.
 *
 * `isMayorista` queda indicando que el pedido superó el tope del canal, para
 * que la UI pueda derivarlo.
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

  // Supera el tope del canal de stock: hay que derivar al mayorista.
  const isMayorista = totalM2 >= config.WHOLESALE_THRESHOLD_M2;

  const precioUnitario = Math.round(m2PerBox * config.RETAIL_PRICE_PER_M2);
  const subtotal = precioUnitario * cantidad;

  return { precioUnitario, subtotal, volumen, m2PerBox, totalM2, isMayorista };
}

export function formatPrecio(valor: number): string {
  return '$' + valor.toLocaleString('es-AR');
}
