/**
 * API Pública: /api/public/retail-quotes
 * Guardar cotizaciones del configurador retail (sin autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded } from '@/lib/utils/box-calculations';
import { calcularPrecioMinorista } from '@/lib/retail/pricing';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { notifyNewRetailLead } from '@/lib/telegram/notifications';
import type { TaxCondition } from '@/lib/types/database';

interface RetailBox {
  largo: number;
  ancho: number;
  alto: number;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  m2PerBox: number;
  totalM2: number;
  isMayorista: boolean;
  standardBoxId?: string;
}

interface RetailQuoteRequest {
  clientType: 'empresa' | 'particular';
  // Empresa
  razonSocial?: string;
  nombreFantasia?: string;
  cuit?: string;
  condicionIva?: string;
  // Particular
  nombreCompleto?: string;
  dni?: string;
  // Contact
  email: string;
  telefono: string;
  // Address (from shipping step)
  direccion?: string;
  ciudad?: string;
  provincia?: string;
  codigoPostal?: string;
  lat?: number;
  lng?: number;
  // Shipping
  shippingMethod?: 'retiro_sucursal' | 'envio_caba_amba' | 'envio_resto_pais';
  shippingCost?: number;
  shippingCostConfirmed?: boolean;
  // Message
  mensaje?: string;
  // Boxes
  boxes: RetailBox[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: RetailQuoteRequest = await request.json();

    // ═══════════════════════════════════════════════════════════
    // VALIDACIONES
    // ═══════════════════════════════════════════════════════════

    const errors: string[] = [];

    if (body.clientType === 'empresa') {
      if (!body.razonSocial?.trim()) errors.push('La razon social es requerida');
      if (!body.cuit?.trim()) errors.push('El CUIT es requerido');
    } else {
      if (!body.nombreCompleto?.trim()) errors.push('El nombre es requerido');
    }

    if (!body.email?.trim()) {
      errors.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      errors.push('El email no es valido');
    }

    if (!body.telefono?.trim()) {
      errors.push('El telefono es requerido');
    }

    if (!body.boxes || body.boxes.length === 0) {
      errors.push('Debe incluir al menos una caja');
    } else {
      // Los limites del canal tambien se validan aca: la UI se puede saltear
      // posteando directo a la API.
      const c = RETAIL_CONFIG;
      body.boxes.forEach((b, i) => {
        const n = i + 1;
        const dims: [string, number, number, number][] = [
          ['largo', b.largo, c.MIN_LARGO, c.MAX_LARGO],
          ['ancho', b.ancho, c.MIN_ANCHO, c.MAX_ANCHO],
          ['alto', b.alto, c.MIN_ALTO, c.MAX_ALTO],
        ];
        for (const [nombre, valor, min, max] of dims) {
          if (!Number.isFinite(valor) || valor < min || valor > max) {
            errors.push(`Caja ${n}: el ${nombre} debe estar entre ${min} y ${max} mm`);
          }
        }
        if (Number.isFinite(b.alto) && Number.isFinite(b.ancho) && b.alto + b.ancho > c.MAX_SHEET_WIDTH) {
          errors.push(`Caja ${n}: alto + ancho no puede superar ${c.MAX_SHEET_WIDTH} mm`);
        }
        if (!Number.isInteger(b.cantidad) || b.cantidad < c.MIN_CANTIDAD) {
          errors.push(`Caja ${n}: el minimo es ${c.MIN_CANTIDAD} unidades`);
        }
      });
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // PREPARAR DATOS
    // ═══════════════════════════════════════════════════════════

    // Derive requester name and tax condition from client type
    const requesterName = body.clientType === 'empresa'
      ? body.razonSocial!.trim()
      : body.nombreCompleto!.trim();

    const requesterCompany = body.clientType === 'empresa'
      ? (body.nombreFantasia?.trim() || body.razonSocial!.trim())
      : null;

    const taxCondition: TaxCondition = body.clientType === 'empresa'
      ? (body.condicionIva as TaxCondition) || 'responsable_inscripto'
      : 'consumidor_final';

    // ═══════════════════════════════════════════════════════════
    // RECALCULO DE PRECIOS EN EL SERVIDOR
    // ═══════════════════════════════════════════════════════════
    // Nunca confiar en precioUnitario/subtotal/totalM2 que manda el cliente:
    // son campos del body y cualquiera puede editarlos desde la pestaña Network.
    // Se recalcula todo a partir de las dimensiones y la cantidad, usando el
    // precio por m2 vigente en la base.

    const { data: pricing } = await supabase
      .from('pricing_config')
      .select('price_per_m2_retail, price_per_m2_standard')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    const configPrecios = {
      ...RETAIL_CONFIG,
      RETAIL_PRICE_PER_M2: Number(pricing?.price_per_m2_retail) || RETAIL_CONFIG.RETAIL_PRICE_PER_M2,
      WHOLESALE_PRICE_PER_M2: Number(pricing?.price_per_m2_standard) || RETAIL_CONFIG.WHOLESALE_PRICE_PER_M2,
    };

    const cajas = body.boxes.map((b) => {
      const precio = calcularPrecioMinorista(b.largo, b.ancho, b.alto, b.cantidad, configPrecios);
      return {
        largo: b.largo,
        ancho: b.ancho,
        alto: b.alto,
        cantidad: b.cantidad,
        standardBoxId: b.standardBoxId,
        precioUnitario: precio.precioUnitario,
        subtotal: precio.subtotal,
        m2PerBox: precio.m2PerBox,
        totalM2: precio.totalM2,
        isMayorista: precio.isMayorista,
      };
    });

    // Use the first box for the primary dimensions (required by public_quotes schema)
    const primaryBox = cajas[0];
    const unfolded = calculateUnfolded(primaryBox.largo, primaryBox.ancho, primaryBox.alto);

    // Calculate totals across all boxes
    const totalSqm = cajas.reduce((sum, b) => sum + b.totalM2, 0);
    const totalSubtotal = cajas.reduce((sum, b) => sum + b.subtotal, 0);

    // El costo de envio tampoco puede venir del cliente. Hoy todos los metodos
    // quedan "a confirmar" salvo el retiro, que es gratis: en ambos casos, 0.
    const shippingCost = 0;

    // Build message with full quote breakdown
    const boxLines = cajas.map((b, i) =>
      `Caja ${i + 1}: ${b.largo}x${b.ancho}x${b.alto}mm — ${b.cantidad} uds — $${b.subtotal.toLocaleString('es-AR')}${b.isMayorista ? ' (mayorista)' : ''}`
    ).join('\n');

    // Shipping info
    const shippingLabel = body.shippingMethod ? {
      retiro_sucursal: 'Retiro por sucursal (Lugones 219, Quilmes)',
      envio_caba_amba: 'Envio CABA/AMBA (costo a confirmar)',
      envio_resto_pais: 'Envio al resto del pais (costo a confirmar)',
    }[body.shippingMethod] : null;

    const fullMessage = [
      `[Cotizacion Retail]`,
      `Tipo: ${body.clientType === 'empresa' ? 'Empresa' : 'Particular'}`,
      body.clientType === 'empresa' && body.cuit ? `CUIT: ${body.cuit}` : null,
      body.clientType === 'particular' && body.dni ? `DNI: ${body.dni}` : null,
      '',
      boxLines,
      '',
      `Total productos: $${totalSubtotal.toLocaleString('es-AR')} (${totalSqm.toFixed(1)} m²)`,
      shippingLabel ? `Envio: ${shippingLabel}` : null,
      body.shippingMethod && body.shippingMethod !== 'retiro_sucursal' && body.direccion
        ? `Direccion: ${body.direccion}, ${body.ciudad || ''}, ${body.provincia || 'Buenos Aires'} ${body.codigoPostal || ''}`
        : null,
      shippingCost > 0
        ? `Total con envio: $${(totalSubtotal + shippingCost).toLocaleString('es-AR')}`
        : null,
      body.mensaje?.trim() ? `\nMensaje: ${body.mensaje.trim()}` : null,
    ].filter(Boolean).join('\n');

    // Tracking metadata
    const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const sourceUserAgent = request.headers.get('user-agent') || 'unknown';

    // ═══════════════════════════════════════════════════════════
    // GUARDAR EN SUPABASE
    // ═══════════════════════════════════════════════════════════

    const { data: quote, error } = await supabase
      .from('public_quotes')
      .insert({
        // Solicitante
        requester_name: requesterName,
        requester_company: requesterCompany,
        requester_email: body.email.trim().toLowerCase(),
        requester_phone: body.telefono.replace(/\D/g, ''),
        requester_cuit: body.cuit?.replace(/\D/g, '') || null,
        requester_tax_condition: taxCondition,

        // Dirección
        address: body.direccion?.trim() || null,
        city: body.ciudad?.trim() || null,
        province: body.provincia || 'Buenos Aires',
        postal_code: body.codigoPostal?.trim() || null,
        delivery_lat: body.lat || null,
        delivery_lng: body.lng || null,

        // Primera caja (campo obligatorio del schema)
        length_mm: primaryBox.largo,
        width_mm: primaryBox.ancho,
        height_mm: primaryBox.alto,
        quantity: primaryBox.cantidad,
        has_printing: false,
        printing_colors: 0,

        // Cálculos
        sheet_width_mm: unfolded.unfoldedWidth,
        sheet_length_mm: unfolded.unfoldedLength,
        sqm_per_box: unfolded.m2,
        total_sqm: totalSqm,
        price_per_m2: totalSqm > 0 ? Math.round(totalSubtotal / totalSqm) : 0,
        unit_price: primaryBox.precioUnitario,
        subtotal: totalSubtotal,
        estimated_days: 5,

        // Tracking
        source_ip: sourceIp,
        source_user_agent: sourceUserAgent,
        message: fullMessage,

        // Estado
        status: 'pending',
        requested_contact: true,
        shipping_method: body.shippingMethod || null,
        shipping_cost: shippingCost,
        fulfillment_status: 'pending_payment',
      })
      .select('id, quote_number')
      .single();

    if (error) {
      console.error('Error saving retail quote:', error);
      return NextResponse.json(
        { error: 'Error al guardar la cotizacion' },
        { status: 500 }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // STOCK: NO se descuenta acá
    // ═══════════════════════════════════════════════════════════
    // Esta ruta guarda una *cotizacion*, no una venta. Descontar stock al cotizar
    // drenaba el catalogo con consultas que nunca se cerraban, y ensuciaba
    // justamente el dato que /api/public/standard-suggestions usa para decidir
    // que medidas puede prometer con entrega inmediata.
    // El descuento tiene que ocurrir cuando la venta se confirma.

    // ═══════════════════════════════════════════════════════════
    // NOTIFICAR POR TELEGRAM
    // ═══════════════════════════════════════════════════════════

    // Await para que no se corte en serverless
    try {
      await notifyNewRetailLead({
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        clientType: body.clientType,
        nombre: requesterName,
        empresa: requesterCompany,
        email: body.email.trim(),
        telefono: body.telefono,
        cuit: body.cuit || null,
        boxes: cajas,
        shippingMethod: body.shippingMethod || null,
        shippingCost,
        shippingCostConfirmed: shippingCost > 0,
        direccion: body.direccion || null,
        ciudad: body.ciudad || null,
        provincia: body.provincia || null,
        source: 'retail',
      });
    } catch (err) {
      console.error('[Telegram] Error notificando:', err);
    }

    return NextResponse.json({
      success: true,
      quote_number: quote.quote_number,
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/public/retail-quotes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
