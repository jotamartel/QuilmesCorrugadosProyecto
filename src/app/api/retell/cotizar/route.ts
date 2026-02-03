/**
 * API: /api/retell/cotizar
 * Función custom para calcular cotizaciones de cajas por teléfono
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CotizarParams, CotizarResponse } from '@/types/retell';
import { RETELL_CONSTANTS } from '@/types/retell';

const {
  PRECIO_BASE_M2,
  ANCHO_LAMINA_MAX_MM,
  SOLAPA_MM,
  DESCUENTOS,
  TIEMPOS_PRODUCCION,
  MEDIDAS,
} = RETELL_CONSTANTS;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extraer parámetros - Retell los envía en args
    const params: CotizarParams = body.args || body;

    console.log('[Retell Cotizar] Parámetros recibidos:', params);

    // Validar parámetros
    const validation = validateParams(params);
    if (!validation.valid) {
      return NextResponse.json({
        response: validation.message,
      } as CotizarResponse);
    }

    const { largo_cm, ancho_cm, alto_cm, cantidad } = params;

    // Calcular dimensiones de la lámina en mm
    const anchoLaminaMm = (alto_cm + ancho_cm) * 10;
    const largoLaminaMm = (2 * largo_cm + 2 * ancho_cm) * 10 + SOLAPA_MM;

    // Verificar si excede el límite de ancho
    if (anchoLaminaMm > ANCHO_LAMINA_MAX_MM) {
      const excesoMm = anchoLaminaMm - ANCHO_LAMINA_MAX_MM;
      const excesoCm = Math.ceil(excesoMm / 10);

      return NextResponse.json({
        response: `Las medidas que me diste exceden nuestra capacidad de producción. ` +
          `El ancho de lámina sería ${anchoLaminaMm} milímetros y nuestro máximo es ${ANCHO_LAMINA_MAX_MM}. ` +
          `Necesitarías reducir ${excesoCm} centímetros entre el alto y el ancho de la caja. ` +
          `¿Querés que te pase con un asesor para ver alternativas?`,
        data: {
          precio_unitario: 0,
          precio_total: 0,
          descuento_porcentaje: 0,
          area_m2_unitario: 0,
          area_m2_total: 0,
          tiempo_produccion: '',
          ancho_lamina_mm: anchoLaminaMm,
          largo_lamina_mm: largoLaminaMm,
          excede_limite: true,
          exceso_mm: excesoMm,
        },
      } as CotizarResponse);
    }

    // Calcular área en m²
    const areaM2Unitario = (anchoLaminaMm * largoLaminaMm) / 1_000_000;
    const areaM2Total = areaM2Unitario * cantidad;

    // Calcular descuento
    const descuento = getDescuento(areaM2Total);
    const descuentoPorcentaje = descuento.porcentaje * 100;

    // Calcular precios
    const precioBase = areaM2Total * PRECIO_BASE_M2;
    const precioConDescuento = precioBase * (1 - descuento.porcentaje);
    const precioTotal = Math.round(precioConDescuento);
    const precioUnitario = Math.round(precioTotal / cantidad);

    // Obtener tiempo de producción
    const tiempoProduccion = getTiempoProduccion(areaM2Total);

    // Guardar cotización en Supabase
    const supabase = createAdminClient();
    let cotizacionId: string | undefined;

    try {
      const { data: cotizacion, error } = await supabase
        .from('public_quotes')
        .insert({
          // Datos del solicitante (se actualizarán si registra lead)
          requester_name: 'Cliente Telefónico',
          requester_email: 'pendiente@telefono.local',
          requester_phone: params.telefono || 'Llamada entrante',
          // Datos de la caja (convertir a mm)
          length_mm: largo_cm * 10,
          width_mm: ancho_cm * 10,
          height_mm: alto_cm * 10,
          quantity: cantidad,
          has_printing: false,
          printing_colors: 0,
          // Cálculos
          sheet_width_mm: anchoLaminaMm,
          sheet_length_mm: largoLaminaMm,
          sqm_per_box: areaM2Unitario,
          total_sqm: areaM2Total,
          price_per_m2: PRECIO_BASE_M2 * (1 - descuento.porcentaje),
          unit_price: precioUnitario,
          subtotal: precioTotal,
          estimated_days: parseInt(tiempoProduccion.split(' ')[0]) || 5,
          // Metadata
          canal: 'telefono',
          call_id: params.call_id || null,
          telefono_cliente: params.telefono || null,
          status: 'pending',
          requested_contact: false,
        })
        .select('id')
        .single();

      if (!error && cotizacion) {
        cotizacionId = cotizacion.id;
        console.log('[Retell Cotizar] Cotización guardada:', cotizacionId);
      } else if (error) {
        console.error('[Retell Cotizar] Error guardando cotización:', error);
      }
    } catch (dbError) {
      console.error('[Retell Cotizar] Error de base de datos:', dbError);
      // Continuar sin guardar, la cotización se puede dar igual
    }

    // Formatear respuesta para Ana
    const precioTotalFormateado = formatearPrecio(precioTotal);
    const precioUnitarioFormateado = formatearPrecio(precioUnitario);
    const areaFormateada = areaM2Total.toFixed(1).replace('.', ',');

    let respuesta = `Perfecto, te cuento. Para ${formatearCantidad(cantidad)} cajas ` +
      `de ${largo_cm} por ${ancho_cm} por ${alto_cm} centímetros, ` +
      `el precio total es ${precioTotalFormateado} pesos, ` +
      `que serían ${precioUnitarioFormateado} pesos por caja.`;

    if (descuentoPorcentaje > 0) {
      respuesta += ` Eso incluye un ${descuentoPorcentaje}% de descuento por volumen.`;
    }

    respuesta += ` El tiempo de producción sería de ${tiempoProduccion}. ` +
      `¿Querés que te envíe esta cotización por email?`;

    console.log('[Retell Cotizar] Respuesta:', {
      precioTotal,
      precioUnitario,
      descuento: descuentoPorcentaje,
      area: areaM2Total,
      tiempo: tiempoProduccion,
    });

    return NextResponse.json({
      response: respuesta,
      data: {
        cotizacion_id: cotizacionId,
        precio_unitario: precioUnitario,
        precio_total: precioTotal,
        descuento_porcentaje: descuentoPorcentaje,
        area_m2_unitario: areaM2Unitario,
        area_m2_total: areaM2Total,
        tiempo_produccion: tiempoProduccion,
        ancho_lamina_mm: anchoLaminaMm,
        largo_lamina_mm: largoLaminaMm,
        excede_limite: false,
      },
    } as CotizarResponse);

  } catch (error) {
    console.error('[Retell Cotizar] Error:', error);
    return NextResponse.json({
      response: 'Disculpá, tuve un problema técnico calculando la cotización. ' +
        '¿Querés que te pase con un asesor?',
    } as CotizarResponse);
  }
}

/**
 * Validar parámetros de cotización
 */
function validateParams(params: CotizarParams): { valid: boolean; message?: string } {
  const { largo_cm, ancho_cm, alto_cm, cantidad } = params;

  // Verificar que existan todos los parámetros
  if (!largo_cm || !ancho_cm || !alto_cm || !cantidad) {
    return {
      valid: false,
      message: 'Necesito que me des las cuatro medidas: largo, ancho, alto en centímetros, ' +
        'y la cantidad de cajas. ¿Me las podés repetir?',
    };
  }

  // Verificar tipos numéricos
  if (isNaN(largo_cm) || isNaN(ancho_cm) || isNaN(alto_cm) || isNaN(cantidad)) {
    return {
      valid: false,
      message: 'No pude entender bien las medidas. ¿Me las podés repetir en centímetros? ' +
        'Por ejemplo: 40 de largo, 30 de ancho, 25 de alto.',
    };
  }

  // Verificar rangos de medidas
  const medidasInvalidas: string[] = [];

  if (largo_cm < MEDIDAS.MIN_CM || largo_cm > MEDIDAS.MAX_CM) {
    medidasInvalidas.push(`largo (${largo_cm}cm)`);
  }
  if (ancho_cm < MEDIDAS.MIN_CM || ancho_cm > MEDIDAS.MAX_CM) {
    medidasInvalidas.push(`ancho (${ancho_cm}cm)`);
  }
  if (alto_cm < MEDIDAS.MIN_CM || alto_cm > MEDIDAS.MAX_CM) {
    medidasInvalidas.push(`alto (${alto_cm}cm)`);
  }

  if (medidasInvalidas.length > 0) {
    return {
      valid: false,
      message: `Las medidas de ${medidasInvalidas.join(' y ')} están fuera del rango. ` +
        `Trabajamos con medidas entre ${MEDIDAS.MIN_CM} y ${MEDIDAS.MAX_CM} centímetros. ` +
        `¿Querés ajustar las medidas?`,
    };
  }

  // Verificar cantidad mínima
  if (cantidad < 1) {
    return {
      valid: false,
      message: 'La cantidad debe ser al menos 1 caja. ¿Cuántas cajas necesitás?',
    };
  }

  if (cantidad < 100) {
    return {
      valid: false,
      message: `Para ${cantidad} cajas el pedido es muy chico para producir. ` +
        `El mínimo es de 100 unidades. ¿Querés que te cotice 100 cajas?`,
    };
  }

  return { valid: true };
}

/**
 * Obtener descuento según volumen
 */
function getDescuento(areaM2: number): { porcentaje: number; nombre: string } {
  for (const d of DESCUENTOS) {
    if (areaM2 >= d.minM2) {
      return { porcentaje: d.descuento, nombre: d.nombre };
    }
  }
  return { porcentaje: 0, nombre: 'sin descuento' };
}

/**
 * Obtener tiempo de producción según volumen
 */
function getTiempoProduccion(areaM2: number): string {
  for (const t of TIEMPOS_PRODUCCION) {
    if (areaM2 <= t.maxM2) {
      return t.tiempo;
    }
  }
  return TIEMPOS_PRODUCCION[TIEMPOS_PRODUCCION.length - 1].tiempo;
}

/**
 * Formatear precio en pesos argentinos
 */
function formatearPrecio(precio: number): string {
  return precio.toLocaleString('es-AR');
}

/**
 * Formatear cantidad con separador de miles
 */
function formatearCantidad(cantidad: number): string {
  return cantidad.toLocaleString('es-AR');
}
