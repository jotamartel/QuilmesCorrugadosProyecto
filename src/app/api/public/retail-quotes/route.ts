/**
 * API Pública: /api/public/retail-quotes
 * Guardar cotizaciones del configurador retail (sin autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded } from '@/lib/utils/box-calculations';
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

    // Use the first box for the primary dimensions (required by public_quotes schema)
    const primaryBox = body.boxes[0];
    const unfolded = calculateUnfolded(primaryBox.largo, primaryBox.ancho, primaryBox.alto);

    // Calculate totals across all boxes
    const totalSqm = body.boxes.reduce((sum, b) => sum + b.totalM2, 0);
    const totalSubtotal = body.boxes.reduce((sum, b) => sum + b.subtotal, 0);

    // Build message with full quote breakdown
    const boxLines = body.boxes.map((b, i) =>
      `Caja ${i + 1}: ${b.largo}x${b.ancho}x${b.alto}mm — ${b.cantidad} uds — $${b.subtotal.toLocaleString('es-AR')}${b.isMayorista ? ' (mayorista)' : ''}`
    ).join('\n');

    // Shipping info
    const shippingLabel = body.shippingMethod ? {
      retiro_sucursal: 'Retiro por sucursal (Lugones 219, Quilmes)',
      envio_caba_amba: `Envio CABA/AMBA ($${(body.shippingCost || 0).toLocaleString('es-AR')})`,
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
      body.shippingCostConfirmed && body.shippingCost
        ? `Total con envio: $${(totalSubtotal + body.shippingCost).toLocaleString('es-AR')}`
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
        shipping_cost: body.shippingCost || 0,
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
    // REDUCIR STOCK (si se eligió caja estándar del catálogo)
    // ═══════════════════════════════════════════════════════════

    for (const box of body.boxes) {
      if (box.standardBoxId) {
        try {
          const { data: currentBox } = await supabase
            .from('boxes')
            .select('stock')
            .eq('id', box.standardBoxId)
            .single();

          if (currentBox) {
            const newStock = Math.max(0, (currentBox.stock || 0) - box.cantidad);
            await supabase
              .from('boxes')
              .update({ stock: newStock })
              .eq('id', box.standardBoxId);
          }
        } catch (stockErr) {
          console.warn('Error reducing stock for box', box.standardBoxId, stockErr);
        }
      }
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
