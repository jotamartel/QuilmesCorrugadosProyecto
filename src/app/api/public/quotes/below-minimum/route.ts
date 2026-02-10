/**
 * API: POST /api/public/quotes/below-minimum
 * Procesar solicitud de cotización menor al mínimo (1000-3000 m2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { sendNotification } from '@/lib/notifications';
import type { PricingConfig } from '@/lib/types/database';

interface BelowMinimumRequest {
  quote_id: string;
  requested_quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: BelowMinimumRequest = await request.json();

    // Validaciones
    if (!body.quote_id) {
      return NextResponse.json({ error: 'quote_id es requerido' }, { status: 400 });
    }

    if (!body.requested_quantity || body.requested_quantity < 1) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 });
    }

    // Obtener la cotización original
    const { data: originalQuote, error: quoteError } = await supabase
      .from('public_quotes')
      .select('*')
      .eq('id', body.quote_id)
      .single();

    if (quoteError || !originalQuote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Obtener configuración de precios
    const { data: pricingConfig, error: pricingError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (pricingError || !pricingConfig) {
      return NextResponse.json(
        { error: 'Error al obtener configuración de precios' },
        { status: 500 }
      );
    }

    const config = pricingConfig as PricingConfig;
    const pricePerM2BelowMinimum = config.price_per_m2_below_minimum || config.price_per_m2_standard * 1.20;

    // Calcular m2 con la nueva cantidad
    const unfolded = calculateUnfolded(
      originalQuote.length_mm,
      originalQuote.width_mm,
      originalQuote.height_mm
    );
    const sqmPerBox = unfolded.m2;
    const totalSqm = calculateTotalM2(sqmPerBox, body.requested_quantity);

    // Validar que esté entre 1000 y min_m2_per_model
    if (totalSqm < 1000) {
      const minQuantity = Math.ceil(1000 / sqmPerBox);
      return NextResponse.json(
        { error: `La cantidad mínima es ${minQuantity} cajas para alcanzar 1000m²` },
        { status: 400 }
      );
    }

    if (totalSqm >= config.min_m2_per_model) {
      return NextResponse.json(
        { error: `El pedido debe ser menor a ${config.min_m2_per_model}m² para usar esta opción` },
        { status: 400 }
      );
    }

    // Calcular precio con recargo
    const subtotal = totalSqm * pricePerM2BelowMinimum;
    const unitPrice = subtotal / body.requested_quantity;

    // Crear o actualizar la cotización como pedido menor al mínimo
    const { data: updatedQuote, error: updateError } = await supabase
      .from('public_quotes')
      .update({
        is_below_minimum: true,
        requested_quantity_below_minimum: body.requested_quantity,
        quantity: body.requested_quantity,
        total_sqm: totalSqm,
        price_per_m2_applied: pricePerM2BelowMinimum,
        price_per_m2: pricePerM2BelowMinimum,
        unit_price: unitPrice,
        subtotal: subtotal,
        is_free_shipping: false, // Pedidos menores al mínimo no tienen envío gratis
        accepted_below_minimum_terms: true,
        requested_contact: true,
        status: 'pending',
      })
      .eq('id', body.quote_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating quote:', updateError);
      return NextResponse.json(
        { error: 'Error al actualizar la cotización' },
        { status: 500 }
      );
    }

    // Enviar notificación especial para pedidos menores al mínimo
    await sendNotification({
      type: 'lead_with_contact',
      origin: 'Web (Menor al mínimo)',
      box: {
        length: originalQuote.length_mm,
        width: originalQuote.width_mm,
        height: originalQuote.height_mm,
      },
      quantity: body.requested_quantity,
      totalArs: subtotal,
      contact: {
        name: originalQuote.requester_name,
        email: originalQuote.requester_email,
        phone: originalQuote.requester_phone,
        company: originalQuote.requester_company,
        notes: `⚠️ PEDIDO MENOR AL MÍNIMO (${totalSqm.toFixed(2)}m²)\n\nCantidad solicitada: ${body.requested_quantity} cajas\nPrecio con recargo aplicado: ${pricePerM2BelowMinimum.toLocaleString('es-AR')} $/m²\n\nEl cliente aceptó las condiciones especiales (sin envío gratis, coordinación de producción).`,
      },
    }).catch(err => {
      console.error('Error sending below minimum notification:', err);
    });

    return NextResponse.json({
      success: true,
      quote: updatedQuote,
    }, { status: 200 });

  } catch (error) {
    console.error('Error in POST /api/public/quotes/below-minimum:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
