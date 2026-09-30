/**
 * Las cajas del cotizador del sitio, calculadas del lado del servidor.
 *
 * POR QUE EXISTE
 *
 * El formulario deja cargar varias medidas en un mismo pedido, pero la consulta
 * se guardaba con una sola: /api/public/leads tomaba la primera caja y
 * /api/public/quotes ni leía las demás (llegaban en additional_boxes y se
 * tiraban). Quien pedía tres medidas quedaba registrado con una, y el vendedor
 * lo llamaba para hablar de un pedido que no era el suyo.
 *
 * Además, los dos endpoints calculaban el precio distinto que el formulario:
 * el formulario le pone a cada medida el escalón de SUS m² (igual que el motor
 * y el bot), y el lead usaba los m² del pedido entero. Con dos medidas, el
 * precio guardado no era el que la persona había visto.
 *
 * Esta es la cuenta del formulario (calculateBoxItem), en un solo lugar para
 * los dos endpoints.
 */

import type { PricingConfig } from '@/lib/types/database';
import { calculateUnfolded, calculateTotalM2, RECARGO_DOS_MITADES } from '@/lib/utils/box-calculations';
import { getPricePerM2 } from '@/lib/utils/pricing';
import { leerMaterial, materialDisponible, type Material } from '@/lib/cotizacion/material';

/** Una caja tal como la manda el formulario. */
export interface CajaDelFormulario {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing?: boolean;
  printing_colors?: number;
  material?: unknown;
  design_file_url?: string | null;
  design_file_name?: string | null;
  design_preview_url?: string | null;
}

/** Una caja calculada: es lo que se guarda en public_quotes.items. */
export interface ItemDeCotizacionWeb {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;
  material: Material;
  sheet_width_mm: number;
  sheet_length_mm: number;
  pieces: number;
  sqm_per_box: number;
  total_sqm: number;
  /** Ya con el recargo de dos mitades si corresponde. */
  price_per_m2: number;
  unit_price: number;
  subtotal: number;
  design_file_url: string | null;
  design_file_name: string | null;
  design_preview_url: string | null;
}

export function calcularCajasWeb(
  cajas: CajaDelFormulario[],
  config: PricingConfig,
): { items: ItemDeCotizacionWeb[]; total_sqm: number; subtotal: number } {
  const items = cajas.map((caja): ItemDeCotizacionWeb => {
    // Un material que no se reconoce o que ya no tiene precio se cotiza en el
    // estándar, que es lo mismo que muestra el formulario en ese caso.
    const pedido = leerMaterial(caja.material) ?? 'simple';
    const material: Material = materialDisponible(config, pedido) ? pedido : 'simple';

    const unfolded = calculateUnfolded(caja.length_mm, caja.width_mm, caja.height_mm);
    const totalSqm = calculateTotalM2(unfolded.m2, caja.quantity);
    const factorMitades = unfolded.pieces === 2 ? 1 + RECARGO_DOS_MITADES : 1;
    const precioM2 = getPricePerM2(totalSqm, config, material) * factorMitades;
    const subtotal = Math.round(totalSqm * precioM2 * 100) / 100;
    const colores = caja.has_printing ? caja.printing_colors || 0 : 0;

    return {
      length_mm: caja.length_mm,
      width_mm: caja.width_mm,
      height_mm: caja.height_mm,
      quantity: caja.quantity,
      has_printing: colores > 0,
      printing_colors: colores,
      material,
      sheet_width_mm: unfolded.unfoldedWidth,
      sheet_length_mm: unfolded.unfoldedLength,
      pieces: unfolded.pieces,
      sqm_per_box: unfolded.m2,
      total_sqm: totalSqm,
      price_per_m2: Math.round(precioM2 * 100) / 100,
      unit_price: caja.quantity > 0 ? Math.round((subtotal / caja.quantity) * 100) / 100 : 0,
      subtotal,
      design_file_url: caja.design_file_url || null,
      design_file_name: caja.design_file_name || null,
      design_preview_url: caja.design_preview_url || null,
    };
  });

  return {
    items,
    total_sqm: Math.round(items.reduce((s, i) => s + i.total_sqm, 0) * 100) / 100,
    subtotal: Math.round(items.reduce((s, i) => s + i.subtotal, 0) * 100) / 100,
  };
}
