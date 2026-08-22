/**
 * API: /api/retell/cotizar
 *
 * Funcion custom que Ana —el bot telefonico— llama para cotizar en vivo. Ana
 * pregunta medidas en centimetros y cantidad; este handler tiene que devolver
 * lo mismo que cualquier otro canal (web, WhatsApp, MCP, API publica) diria
 * ante el mismo pedido.
 *
 * Antes tenia su propia copia de la formula: calculaba ancho de lamina con un
 * SOLAPA_MM propio, un ANCHO_LAMINA_MAX_MM de 1200 duplicado en RETELL_CONSTANTS,
 * y validaba rangos de 5 a 500 cm que no coincidian con MEDIDA_MINIMA/MAXIMA.
 * Encima solo cortaba por el minimo de compra: no conocia la produccion a
 * medida (1.000 m²), no conocia el "no fabricable" —cajas que no entran en el
 * rollo, o que se pasan del maximo—, y no conocia el catalogo de stock. O sea:
 * Ana cotizaba distinto que la web y podia prometer precio para una caja que
 * la fabrica no puede producir.
 *
 * Ahora delega TODO en calcularCotizacion(): la misma union discriminada por
 * `cotizable` que consumen los demas canales, con impedimentos tipados y con
 * alternativas de catalogo pre-cotizadas. El contrato de salida —el shape del
 * JSON que Ana consume— se preserva: cambia lo que dice, no como lo entrega.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActivePricingConfig } from '@/lib/utils/pricing';
import type { CotizarParams, CotizarResponse } from '@/types/retell';
import {
  calcularCotizacion,
  mensajeDeImpedimento,
  type BoxInput,
} from '@/lib/cotizacion/motor';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { respuestaSiNoCorresponde } from '@/lib/retell-acceso';

export async function POST(request: NextRequest) {
  try {
    // La compuerta abre todo /api/retell/ para el agente de voz, asi que el
    // control de quien llama tiene que estar aca. Ver src/lib/retell-acceso.ts.
    const noCorresponde = respuestaSiNoCorresponde(request, '/api/retell/cotizar');
    if (noCorresponde) return noCorresponde;

    const body = await request.json();

    // Retell manda los parametros dentro de `args`. Si alguien pega el body
    // directo (p. ej. probando con curl), tambien lo aceptamos.
    const params: CotizarParams = body.args || body;

    console.log('[Retell Cotizar] Parámetros recibidos:', params);

    // Sanidad basica: que existan y sean numeros positivos. Los limites
    // reales de medida —minima 200x200x100, maxima 2000x2000x1500, y que
    // ancho+alto entre en el rollo de 1.200— los hace cumplir el motor y
    // vuelven como impedimento con `tipo: 'no_fabricable'`. No los duplicamos.
    const validation = validateParams(params);
    if (!validation.valid) {
      return NextResponse.json({
        response: validation.message,
      } as CotizarResponse);
    }

    const { largo_cm, ancho_cm, alto_cm, cantidad } = params;

    // Configuracion viva de precios y catalogo de stock, exactamente como los
    // lee /api/whatsapp/webhook. Es lo que le pasa al motor para que decida
    // canal (stock vs a medida), alternativas de catalogo y precio por m².
    const pricingConfig = await getActivePricingConfig();
    if (!pricingConfig) {
      return NextResponse.json({
        response: 'Disculpá, hay un problema técnico con los precios. ' +
          '¿Querés que te pase con un asesor?',
      } as CotizarResponse);
    }

    const supabase = createAdminClient();
    const { data: catalogo } = await supabase
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true);

    // Ana pregunta en cm, el motor trabaja en mm. La conversion es la unica
    // adaptacion: de ahi para adelante decide el motor.
    const box: BoxInput = {
      length_mm: largo_cm * 10,
      width_mm: ancho_cm * 10,
      height_mm: alto_cm * 10,
      quantity: cantidad,
      // Ana todavia no pregunta por impresion. Cuando lo haga, se agrega aca;
      // el motor ya sabe hacer la cuenta con colores y aplicar el recargo.
      printing_colors: 0,
    };

    const quote = calcularCotizacion([box], pricingConfig, catalogo || []);

    // ─── Pedido que NO se puede vender ───────────────────────────────────
    //
    // Puede ser por volumen (bajo_minimo, medida_propia_sin_volumen) o porque
    // la caja no se fabrica (no_fabricable). mensajeDeImpedimento() ya devuelve
    // el "no" completo listo para leer, y el motivo incluye las alternativas
    // de catalogo mas parecidas cuando existen. NO agregamos frases del tipo
    // "coordinamos por WhatsApp": ese fue justo el incidente que motivo mover
    // este handler al motor —el minimo es excluyente y no se negocia.
    if (!quote.cotizable) {
      const b0 = quote.boxes[0];
      const respuesta = mensajeDeImpedimento(quote.impedimento);
      const esNoFabricable = quote.impedimento.tipo === 'no_fabricable';

      // Ana solo necesita el texto; `data` viaja igual con lo poco que tiene
      // sentido informar sin precio. `excede_limite` se prende cuando la caja
      // no se puede fabricar (el analogo del viejo comportamiento). `exceso_mm`
      // se calcula solo si el problema puntual es la plancha, porque el resto
      // de los "no fabricables" —medida minima, maxima— no tienen exceso lineal.
      const anchoPlanchaMm = b0.sheet_width_mm;
      const excesoPlancha =
        esNoFabricable && anchoPlanchaMm > RETAIL_CONFIG.MAX_SHEET_WIDTH
          ? anchoPlanchaMm - RETAIL_CONFIG.MAX_SHEET_WIDTH
          : undefined;

      return NextResponse.json({
        response: respuesta,
        data: {
          precio_unitario: 0,
          precio_total: 0,
          descuento_porcentaje: 0,
          area_m2_unitario: b0.sqm_per_box,
          area_m2_total: quote.total_m2,
          tiempo_produccion: '',
          ancho_lamina_mm: b0.sheet_width_mm,
          largo_lamina_mm: b0.sheet_length_mm,
          excede_limite: esNoFabricable,
          ...(excesoPlancha !== undefined ? { exceso_mm: excesoPlancha } : {}),
        },
      } as CotizarResponse);
    }

    // ─── Pedido cotizable ────────────────────────────────────────────────
    //
    // En esta rama el motor ya narrowed a `cotizable: true`, asi que boxes[0]
    // es un BoxResultConPrecio y unit_price/subtotal son numeros de verdad.
    const b0 = quote.boxes[0];

    // El motor devuelve precio_unitario en pesos con dos decimales (los que se
    // pierden al redondear se ven en la factura). Para el guion oral de Ana
    // lo redondeamos a peso entero: repite "novecientos ochenta y siete pesos
    // con cincuenta y tres centavos" no aporta nada por telefono. Los valores
    // que guardamos en la base y devolvemos en `data` son los redondeados,
    // asi no discrepan con lo que Ana dice.
    const precioUnitario = Math.round(b0.unit_price);
    const precioTotal = Math.round(b0.subtotal);

    // Descuento vs precio estandar del PricingConfig, calculado sobre el
    // precio del m² efectivo (que ya incorpora la escalera del motor). Es la
    // misma cuenta que hacia el viejo handler, solo que la base sale del motor.
    const precioEstandar = quote.total_m2 * pricingConfig.price_per_m2_standard;
    const descuentoPorcentaje =
      precioEstandar > 0 && precioEstandar > precioTotal
        ? Math.round(((precioEstandar - precioTotal) / precioEstandar) * 100)
        : 0;

    const tiempoProduccion = `${quote.estimated_days} días hábiles`;

    // Guardar la cotizacion. Se guarda solo cuando hay precio: por debajo del
    // piso no hay cotizacion que guardar, hay una devolucion sin precio.
    let cotizacionId: string | undefined;
    try {
      const { data: cotizacion, error } = await supabase
        .from('public_quotes')
        .insert({
          requester_name: 'Cliente Telefónico',
          requester_email: 'pendiente@telefono.local',
          requester_phone: params.telefono || 'Llamada entrante',
          length_mm: box.length_mm,
          width_mm: box.width_mm,
          height_mm: box.height_mm,
          quantity: cantidad,
          has_printing: b0.has_printing,
          printing_colors: b0.printing_colors,
          sheet_width_mm: b0.sheet_width_mm,
          sheet_length_mm: b0.sheet_length_mm,
          sqm_per_box: b0.sqm_per_box,
          total_sqm: quote.total_m2,
          price_per_m2: b0.price_per_m2,
          unit_price: precioUnitario,
          subtotal: precioTotal,
          estimated_days: quote.estimated_days,
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
      // No cortamos: la cotizacion se puede dar igual aunque falle guardarla.
    }

    // Guion de Ana. Mismo formato que antes: total, unitario, descuento y
    // tiempo. El motor tiene mejores resumenes (`quote.summary`), pero ese
    // texto esta pensado para leerse en un chat, no para decirse en voz alta;
    // el guion oral se queda armado aca.
    const precioTotalFormateado = formatearPrecio(precioTotal);
    const precioUnitarioFormateado = formatearPrecio(precioUnitario);

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
      area: quote.total_m2,
      tiempo: tiempoProduccion,
    });

    return NextResponse.json({
      response: respuesta,
      data: {
        cotizacion_id: cotizacionId,
        precio_unitario: precioUnitario,
        precio_total: precioTotal,
        descuento_porcentaje: descuentoPorcentaje,
        area_m2_unitario: b0.sqm_per_box,
        area_m2_total: quote.total_m2,
        tiempo_produccion: tiempoProduccion,
        ancho_lamina_mm: b0.sheet_width_mm,
        largo_lamina_mm: b0.sheet_length_mm,
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
 * Sanidad basica de los parametros de entrada.
 *
 * NO valida rangos de fabricacion (medida minima/maxima, ancho de rollo, piso
 * de compra). Todo eso lo hace calcularCotizacion() y vuelve como impedimento
 * tipado, para que la respuesta sea la misma que en cualquier otro canal.
 * Aca solo cortamos por lo que ni siquiera podemos pasarle al motor: numeros
 * que no llegaron o que no son numeros.
 */
function validateParams(params: CotizarParams): { valid: boolean; message?: string } {
  const { largo_cm, ancho_cm, alto_cm, cantidad } = params;

  if (!largo_cm || !ancho_cm || !alto_cm || !cantidad) {
    return {
      valid: false,
      message: 'Necesito que me des las cuatro medidas: largo, ancho, alto en centímetros, ' +
        'y la cantidad de cajas. ¿Me las podés repetir?',
    };
  }

  if (isNaN(largo_cm) || isNaN(ancho_cm) || isNaN(alto_cm) || isNaN(cantidad)) {
    return {
      valid: false,
      message: 'No pude entender bien las medidas. ¿Me las podés repetir en centímetros? ' +
        'Por ejemplo: 40 de largo, 30 de ancho, 25 de alto.',
    };
  }

  if (largo_cm <= 0 || ancho_cm <= 0 || alto_cm <= 0) {
    return {
      valid: false,
      message: 'Las medidas tienen que ser mayores a cero. ¿Me las podés repetir?',
    };
  }

  if (cantidad < 1) {
    return {
      valid: false,
      message: 'La cantidad debe ser al menos 1 caja. ¿Cuántas cajas necesitás?',
    };
  }

  return { valid: true };
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
