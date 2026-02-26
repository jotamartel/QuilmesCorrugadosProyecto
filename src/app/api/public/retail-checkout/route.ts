/**
 * API Pública: /api/public/retail-checkout
 * Crea una preferencia de MercadoPago Checkout Pro
 * 1. Guarda la cotización en Supabase (igual que retail-quotes)
 * 2. Crea una preferencia de pago en MercadoPago
 * 3. Devuelve el init_point (URL de pago)
 */

import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded } from '@/lib/utils/box-calculations';
import type { TaxCondition } from '@/lib/types/database';

const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';

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

interface CheckoutRequest {
  clientType: 'empresa' | 'particular';
  razonSocial?: string;
  nombreFantasia?: string;
  cuit?: string;
  condicionIva?: string;
  nombreCompleto?: string;
  dni?: string;
  email: string;
  telefono: string;
  direccion?: string;
  ciudad?: string;
  provincia?: string;
  codigoPostal?: string;
  lat?: number;
  lng?: number;
  shippingMethod?: 'retiro_sucursal' | 'envio_caba_amba' | 'envio_resto_pais';
  shippingCost?: number;
  shippingCostConfirmed?: boolean;
  mensaje?: string;
  boxes: RetailBox[];
}

export async function POST(request: NextRequest) {
  try {
    if (!MP_ACCESS_TOKEN || MP_ACCESS_TOKEN.includes('0000000000')) {
      return NextResponse.json(
        { error: 'MercadoPago no está configurado. Configura MERCADOPAGO_ACCESS_TOKEN.' },
        { status: 503 }
      );
    }

    const supabase = createAdminClient();
    const body: CheckoutRequest = await request.json();

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

    if (!body.telefono?.trim()) errors.push('El telefono es requerido');
    if (!body.boxes || body.boxes.length === 0) errors.push('Debe incluir al menos una caja');

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // GUARDAR COTIZACIÓN EN SUPABASE
    // ═══════════════════════════════════════════════════════════

    const requesterName = body.clientType === 'empresa'
      ? body.razonSocial!.trim()
      : body.nombreCompleto!.trim();

    const requesterCompany = body.clientType === 'empresa'
      ? (body.nombreFantasia?.trim() || body.razonSocial!.trim())
      : null;

    const taxCondition: TaxCondition = body.clientType === 'empresa'
      ? (body.condicionIva as TaxCondition) || 'responsable_inscripto'
      : 'consumidor_final';

    const primaryBox = body.boxes[0];
    const unfolded = calculateUnfolded(primaryBox.largo, primaryBox.ancho, primaryBox.alto);
    const totalSqm = body.boxes.reduce((sum, b) => sum + b.totalM2, 0);
    const totalSubtotal = body.boxes.reduce((sum, b) => sum + b.subtotal, 0);

    // Shipping
    const shippingCost = body.shippingCostConfirmed ? (body.shippingCost || 0) : 0;
    const totalConEnvio = totalSubtotal + shippingCost;

    const shippingLabel = body.shippingMethod ? {
      retiro_sucursal: 'Retiro por sucursal (Lugones 219, Quilmes)',
      envio_caba_amba: `Envio CABA/AMBA ($${shippingCost.toLocaleString('es-AR')})`,
      envio_resto_pais: 'Envio al resto del pais (costo a confirmar)',
    }[body.shippingMethod] : null;

    const boxLines = body.boxes.map((b, i) =>
      `Caja ${i + 1}: ${b.largo}x${b.ancho}x${b.alto}mm — ${b.cantidad} uds — $${b.subtotal.toLocaleString('es-AR')}${b.isMayorista ? ' (mayorista)' : ''}`
    ).join('\n');

    const fullMessage = [
      `[Cotizacion Retail — Pago MP]`,
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
      body.shippingCostConfirmed && shippingCost > 0
        ? `Total con envio: $${totalConEnvio.toLocaleString('es-AR')}`
        : null,
      body.mensaje?.trim() ? `\nMensaje: ${body.mensaje.trim()}` : null,
    ].filter(Boolean).join('\n');

    const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') || 'unknown';

    const { data: quote, error } = await supabase
      .from('public_quotes')
      .insert({
        requester_name: requesterName,
        requester_company: requesterCompany,
        requester_email: body.email.trim().toLowerCase(),
        requester_phone: body.telefono.replace(/\D/g, ''),
        requester_cuit: body.cuit?.replace(/\D/g, '') || null,
        requester_tax_condition: taxCondition,
        address: body.direccion?.trim() || null,
        city: body.ciudad?.trim() || null,
        province: body.provincia || 'Buenos Aires',
        postal_code: body.codigoPostal?.trim() || null,
        delivery_lat: body.lat || null,
        delivery_lng: body.lng || null,
        length_mm: primaryBox.largo,
        width_mm: primaryBox.ancho,
        height_mm: primaryBox.alto,
        quantity: primaryBox.cantidad,
        has_printing: false,
        printing_colors: 0,
        sheet_width_mm: unfolded.unfoldedWidth,
        sheet_length_mm: unfolded.unfoldedLength,
        sqm_per_box: unfolded.m2,
        total_sqm: totalSqm,
        price_per_m2: totalSqm > 0 ? Math.round(totalSubtotal / totalSqm) : 0,
        unit_price: primaryBox.precioUnitario,
        subtotal: totalConEnvio,
        estimated_days: 5,
        source_ip: sourceIp,
        source_user_agent: request.headers.get('user-agent') || 'unknown',
        message: fullMessage,
        status: 'pending',
        requested_contact: true,
        shipping_method: body.shippingMethod || null,
        shipping_cost: shippingCost,
        fulfillment_status: 'pending_payment',
      })
      .select('id, quote_number')
      .single();

    if (error) {
      console.error('Error saving quote:', error);
      return NextResponse.json({ error: 'Error al guardar la cotizacion' }, { status: 500 });
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

    // ═══════════════════════════════════════════════════════════
    // CREAR PREFERENCIA DE MERCADOPAGO
    // ═══════════════════════════════════════════════════════════

    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    // Build items list
    const items = body.boxes.map((box, i) => ({
      id: `box-${i + 1}`,
      title: `Caja ${box.largo}x${box.ancho}x${box.alto}mm`,
      description: `Caja de carton corrugado ${box.largo}x${box.ancho}x${box.alto}mm x${box.cantidad} unidades`,
      quantity: 1, // Agrupamos como subtotal
      unit_price: box.subtotal,
      currency_id: 'ARS' as const,
    }));

    // Add shipping as item if confirmed cost
    if (body.shippingCostConfirmed && shippingCost > 0) {
      items.push({
        id: 'shipping',
        title: `Envio ${body.shippingMethod === 'envio_caba_amba' ? 'CABA/AMBA' : 'Nacional'}`,
        description: `Costo de envio`,
        quantity: 1,
        unit_price: shippingCost,
        currency_id: 'ARS' as const,
      });
    }

    // Base URL for callbacks
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://quilmes-corrugados.vercel.app';

    const preferenceData = await preference.create({
      body: {
        items,
        payer: {
          name: requesterName,
          email: body.email.trim().toLowerCase(),
          phone: {
            number: body.telefono.replace(/\D/g, ''),
          },
        },
        back_urls: {
          success: `${baseUrl}/cajas/pago?status=approved&quote=${quote.id}`,
          failure: `${baseUrl}/cajas/pago?status=rejected&quote=${quote.id}`,
          pending: `${baseUrl}/cajas/pago?status=pending&quote=${quote.id}`,
        },
        auto_return: 'approved',
        external_reference: quote.id,
        statement_descriptor: 'QUILMES CORRUGADOS',
        notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      },
    });

    // ═══════════════════════════════════════════════════════════
    // RESPUESTA
    // ═══════════════════════════════════════════════════════════

    return NextResponse.json({
      success: true,
      quote_id: quote.id,
      quote_number: quote.quote_number,
      init_point: preferenceData.init_point,
      sandbox_init_point: preferenceData.sandbox_init_point,
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/public/retail-checkout:', error);
    return NextResponse.json(
      { error: 'Error al crear el checkout' },
      { status: 500 }
    );
  }
}
