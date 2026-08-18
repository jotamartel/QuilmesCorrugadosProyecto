/**
 * Funciones de cálculo de precios y envío
 * Quilmes Corrugados
 */

import type { PricingConfig } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Obtiene la configuración de precios activa desde la base de datos
 * Esta función debe usarse en el servidor (API routes, server components)
 */
export async function getActivePricingConfig(): Promise<PricingConfig | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('Error fetching active pricing config:', error);
      return null;
    }

    return data as PricingConfig;
  } catch (error) {
    console.error('Error in getActivePricingConfig:', error);
    return null;
  }
}

/**
 * Precio por m² según el volumen total. Es la ÚNICA escalera del sistema:
 * cualquier canal que cotice tiene que pasar por acá, para que un mismo
 * volumen no pueda salir a dos precios distintos según por dónde entre.
 *
 *   < wholesale_min_m2          → precio de stock (se vende desde /cajas)
 *   hasta min_m2_per_model      → a medida con recargo por bajo mínimo
 *   hasta volume_threshold_m2   → a medida, precio estándar
 *   de ahí en adelante          → a medida, precio por volumen
 *
 * Los cuatro precios y los tres cortes salen de pricing_config, editable desde
 * el dashboard: no hay ningún umbral escrito en el código.
 */
export function getPricePerM2(totalM2: number, config: PricingConfig): number {
  // Por debajo del mínimo para producir a medida se vende de stock.
  if (totalM2 < config.wholesale_min_m2) {
    return config.price_per_m2_retail;
  }

  // Entre el mínimo a medida y el mínimo por modelo: recargo por bajo volumen.
  if (totalM2 < config.min_m2_per_model) {
    return config.price_per_m2_below_minimum || config.price_per_m2_standard * 1.20;
  }

  if (totalM2 >= config.volume_threshold_m2) {
    return config.price_per_m2_volume;
  }

  return config.price_per_m2_standard;
}

/**
 * Calcula el subtotal (m² × precio)
 * @returns Subtotal redondeado a 2 decimales
 */
export function calculateSubtotal(totalM2: number, pricePerM2: number): number {
  const subtotal = totalM2 * pricePerM2;
  return Math.round(subtotal * 100) / 100;
}

/**
 * Verifica si aplica envío gratis. Los dos umbrales salen de pricing_config,
 * asi que no se escriben aca: el texto que acompaña tambien los lee de ahi.
 */
export function isFreeShipping(
  totalM2: number,
  distanceKm: number | null | undefined,
  config: PricingConfig
): boolean {
  if (distanceKm === null || distanceKm === undefined) {
    return false;
  }
  return totalM2 >= config.free_shipping_min_m2 && distanceKm <= config.free_shipping_max_km;
}

/**
 * Genera notas de envío según las condiciones
 */
export function getShippingNotes(
  totalM2: number,
  distanceKm: number | null | undefined,
  config: PricingConfig
): string {
  if (distanceKm === null || distanceKm === undefined) {
    return 'Distancia del cliente no especificada. Consultar costo de envío.';
  }

  const freeShipping = isFreeShipping(totalM2, distanceKm, config);

  if (freeShipping) {
    return `Envío gratis incluido (pedido mayorista ≥ ${config.free_shipping_min_m2.toLocaleString('es-AR')} m² y distancia ≤ ${config.free_shipping_max_km} km)`;
  }

  const reasons: string[] = [];

  if (totalM2 < config.free_shipping_min_m2) {
    reasons.push(`pedido menor a ${config.free_shipping_min_m2.toLocaleString('es-AR')} m²`);
  }

  if (distanceKm > config.free_shipping_max_km) {
    reasons.push(`distancia mayor a ${config.free_shipping_max_km} km`);
  }

  return `Envío a cotizar (${reasons.join(', ')})`;
}

/**
 * Obtiene los días de producción según si hay impresión
 */
export function getProductionDays(hasPrinting: boolean, config: PricingConfig): number {
  return hasPrinting ? config.production_days_printing : config.production_days_standard;
}

/**
 * Calcula el costo total de la cotización
 */
export function calculateTotal(
  subtotal: number,
  printingCost: number = 0,
  dieCutCost: number = 0,
  shippingCost: number = 0
): number {
  const total = subtotal + printingCost + dieCutCost + shippingCost;
  return Math.round(total * 100) / 100;
}

/**
 * Calcula los montos de pago (50% seña, 50% contra entrega)
 */
export function calculatePaymentAmounts(total: number): {
  deposit: number;
  balance: number;
} {
  const deposit = Math.round((total / 2) * 100) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;
  return { deposit, balance };
}

/**
 * Formatea un monto en pesos argentinos
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formatea m² con separador de miles
 */
export function formatM2(m2: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(m2);
}
