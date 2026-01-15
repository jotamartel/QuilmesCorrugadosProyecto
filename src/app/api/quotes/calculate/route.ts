/**
 * API: POST /api/quotes/calculate
 * Calcula una cotización sin guardarla
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  calculateUnfolded,
  isOversized,
  isUndersized,
  calculateMinimumQuantity,
  calculateTotalM2,
  meetsMinimum,
} from '@/lib/utils/box-calculations';
import {
  getPricePerM2,
  calculateSubtotal,
  isFreeShipping,
  getShippingNotes,
  getProductionDays,
  calculateTotal,
} from '@/lib/utils/pricing';
import { calculateDeliveryDate, toISODateString } from '@/lib/utils/dates';
import type {
  CalculateQuoteRequest,
  CalculateQuoteResponse,
  CalculatedItem,
  PricingConfig,
} from '@/lib/types/database';

export async function POST(request: NextRequest) {
  try {
    const body: CalculateQuoteRequest = await request.json();

    // Validar que hay items
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Debe incluir al menos un item' },
        { status: 400 }
      );
    }

    // Obtener configuración de precios activa
    const supabase = createAdminClient();
    const { data: configData, error: configError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (configError || !configData) {
      return NextResponse.json(
        { error: 'No se encontró configuración de precios activa' },
        { status: 500 }
      );
    }

    const config: PricingConfig = configData;
    const warnings: string[] = [];

    // Procesar cada item
    const calculatedItems: CalculatedItem[] = [];
    let grandTotalM2 = 0;

    for (const item of body.items) {
      const { length_mm, width_mm, height_mm, quantity, box_id } = item;

      // Validar dimensiones
      if (!length_mm || !width_mm || !height_mm || !quantity) {
        return NextResponse.json(
          { error: 'Cada item debe tener length_mm, width_mm, height_mm y quantity' },
          { status: 400 }
        );
      }

      if (quantity <= 0) {
        return NextResponse.json(
          { error: 'La cantidad debe ser mayor a 0' },
          { status: 400 }
        );
      }

      // Verificar tamaño mínimo
      const undersized = isUndersized(length_mm, width_mm, height_mm);
      if (undersized) {
        return NextResponse.json(
          { error: `La caja ${length_mm}x${width_mm}x${height_mm} es menor al tamaño mínimo permitido (200x200x100 mm)` },
          { status: 400 }
        );
      }

      // Calcular medidas desplegadas
      const { unfoldedWidth, unfoldedLength, m2 } = calculateUnfolded(
        length_mm,
        width_mm,
        height_mm
      );

      // Calcular totales del item
      const totalM2 = calculateTotalM2(m2, quantity);
      const oversized = isOversized(length_mm, width_mm, height_mm);
      const minQty = calculateMinimumQuantity(m2, config.min_m2_per_model);
      const meetsMin = meetsMinimum(totalM2, config.min_m2_per_model);

      // Agregar warnings específicos del item
      if (oversized) {
        warnings.push(
          `La caja ${length_mm}x${width_mm}x${height_mm} mm excede el tamaño estándar. Requiere precio especial a cotizar.`
        );
      }

      if (!meetsMin) {
        warnings.push(
          `El modelo ${length_mm}x${width_mm}x${height_mm} no alcanza el mínimo recomendado de ${config.min_m2_per_model.toLocaleString('es-AR')} m². Cantidad sugerida: ${minQty.toLocaleString('es-AR')} unidades.`
        );
      }

      calculatedItems.push({
        length_mm,
        width_mm,
        height_mm,
        unfolded_length_mm: unfoldedLength,
        unfolded_width_mm: unfoldedWidth,
        m2_per_box: m2,
        quantity,
        total_m2: totalM2,
        is_oversized: oversized,
        is_undersized: undersized,
        meets_minimum: meetsMin,
        minimum_required_qty: minQty,
        box_id,
      });

      grandTotalM2 += totalM2;
    }

    // Calcular precio según volumen
    const pricePerM2 = getPricePerM2(grandTotalM2, config);
    const subtotal = calculateSubtotal(grandTotalM2, pricePerM2);

    // Calcular costo de impresión (solo polímero si es diseño nuevo)
    let printingCost = 0;
    if (body.has_printing && !body.has_existing_polymer) {
      // El costo del polímero se ingresa manualmente, aquí solo indicamos que hay costo
      printingCost = 0; // Se debe ingresar al crear la cotización
      warnings.push('Impresión solicitada. Ingrese el costo del polímero al crear la cotización.');
    }

    // Troquelado
    const dieCutCost = 0;
    if (body.has_die_cut) {
      warnings.push('Troquelado solicitado. El costo debe cotizarse por separado.');
    }

    // Calcular envío
    const distanceKm = body.client_distance_km;
    const freeShipping = isFreeShipping(grandTotalM2, distanceKm, config);
    const shippingCost = 0; // Se cobra manualmente si no es gratis
    const shippingNotes = getShippingNotes(grandTotalM2, distanceKm, config);

    if (!freeShipping && distanceKm !== undefined) {
      warnings.push(shippingNotes);
    }

    // Calcular total
    const total = calculateTotal(subtotal, printingCost, dieCutCost, shippingCost);

    // Calcular días de producción y fecha de entrega
    const hasPrinting = body.has_printing || false;
    const productionDays = getProductionDays(hasPrinting, config);
    const estimatedDelivery = calculateDeliveryDate(productionDays);

    const response: CalculateQuoteResponse = {
      items: calculatedItems,
      summary: {
        total_m2: Math.round(grandTotalM2 * 10000) / 10000,
        price_per_m2: pricePerM2,
        subtotal,
        printing_cost: printingCost,
        die_cut_cost: dieCutCost,
        shipping_cost: shippingCost,
        shipping_notes: shippingNotes,
        total,
        production_days: productionDays,
        estimated_delivery: toISODateString(estimatedDelivery),
        warnings,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error calculating quote:', error);
    return NextResponse.json(
      { error: 'Error al calcular la cotización' },
      { status: 500 }
    );
  }
}
