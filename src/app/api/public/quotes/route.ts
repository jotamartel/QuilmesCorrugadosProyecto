/**
 * API Pública: /api/public/quotes
 * Crear cotizaciones desde el sitio web público (sin autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal, getProductionDays } from '@/lib/utils/pricing';
import { sendNotification } from '@/lib/notifications';
import type { CreatePublicQuoteRequest, PricingConfig } from '@/lib/types/database';

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: CreatePublicQuoteRequest = await request.json();

    // ═══════════════════════════════════════════════════════════
    // VALIDACIONES
    // ═══════════════════════════════════════════════════════════

    const errors: string[] = [];

    // Datos del solicitante requeridos
    if (!body.requester_name?.trim()) {
      errors.push('El nombre es requerido');
    }
    if (!body.requester_email?.trim()) {
      errors.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.requester_email)) {
      errors.push('El email no es válido');
    }
    if (!body.requester_phone?.trim()) {
      errors.push('El teléfono es requerido');
    }

    // Dimensiones de la caja
    if (!body.length_mm || body.length_mm < 200 || body.length_mm > 800) {
      errors.push('El largo debe estar entre 200 y 800 mm');
    }
    if (!body.width_mm || body.width_mm < 200 || body.width_mm > 600) {
      errors.push('El ancho debe estar entre 200 y 600 mm');
    }
    if (!body.height_mm || body.height_mm < 100 || body.height_mm > 600) {
      errors.push('El alto debe estar entre 100 y 600 mm');
    }
    if (!body.quantity || body.quantity < 100) {
      errors.push('La cantidad mínima es 100 unidades');
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════
    // OBTENER CONFIGURACIÓN DE PRECIOS
    // ═══════════════════════════════════════════════════════════

    const { data: pricingConfig, error: pricingError } = await supabase
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (pricingError || !pricingConfig) {
      console.error('Error fetching pricing config:', pricingError);
      return NextResponse.json(
        { error: 'Error al obtener configuración de precios' },
        { status: 500 }
      );
    }

    const config = pricingConfig as PricingConfig;

    // ═══════════════════════════════════════════════════════════
    // CALCULAR DIMENSIONES Y PRECIOS
    // ═══════════════════════════════════════════════════════════

    // Calcular plancha desplegada
    const unfolded = calculateUnfolded(body.length_mm, body.width_mm, body.height_mm);

    // Calcular m² totales
    const totalSqm = calculateTotalM2(unfolded.m2, body.quantity);

    // Obtener precio por m² según volumen
    const pricePerM2 = getPricePerM2(totalSqm, config);

    // Calcular subtotal
    const subtotal = calculateSubtotal(totalSqm, pricePerM2);

    // Calcular precio unitario
    const unitPrice = Math.round((subtotal / body.quantity) * 100) / 100;

    // Días de producción
    const estimatedDays = getProductionDays(body.has_printing || false, config);

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR METADATA
    // ═══════════════════════════════════════════════════════════

    const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const sourceUserAgent = request.headers.get('user-agent') || 'unknown';

    // ═══════════════════════════════════════════════════════════
    // BUSCAR LEAD EXISTENTE O CREAR NUEVO
    // ═══════════════════════════════════════════════════════════

    const normalizedEmail = body.requester_email.trim().toLowerCase();

    // Buscar si hay un lead reciente (últimas 24 horas) con el mismo email que aún no pidió contacto
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: existingLead } = await supabase
      .from('public_quotes')
      .select('id')
      .eq('requester_email', normalizedEmail)
      .eq('requested_contact', false)
      .eq('status', 'pending')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let quote;
    let error;

    if (existingLead) {
      // Actualizar el lead existente marcándolo como que pidió contacto
      const { data: updatedQuote, error: updateError } = await supabase
        .from('public_quotes')
        .update({
          requested_contact: true,
          // Actualizar datos por si cambiaron
          requester_name: body.requester_name.trim(),
          requester_company: body.requester_company?.trim() || null,
          requester_phone: body.requester_phone.replace(/\D/g, ''),
          requester_cuit: body.requester_cuit?.replace(/\D/g, '') || null,
          requester_tax_condition: body.requester_tax_condition || 'consumidor_final',
          address: body.address?.trim() || null,
          city: body.city?.trim() || null,
          province: body.province || 'Buenos Aires',
          postal_code: body.postal_code?.trim() || null,
          message: body.message?.trim() || null,
          // Diseño
          design_file_url: body.design_file_url || null,
          design_file_name: body.design_file_name || null,
          design_preview_url: (body as { design_preview_url?: string }).design_preview_url || null,
        })
        .eq('id', existingLead.id)
        .select()
        .single();

      quote = updatedQuote;
      error = updateError;
    } else {
      // Crear nueva cotización web (con requested_contact = true)
      const { data: newQuote, error: insertError } = await supabase
        .from('public_quotes')
        .insert({
          // Datos del solicitante
          requester_name: body.requester_name.trim(),
          requester_company: body.requester_company?.trim() || null,
          requester_email: normalizedEmail,
          requester_phone: body.requester_phone.replace(/\D/g, ''),
          requester_cuit: body.requester_cuit?.replace(/\D/g, '') || null,
          requester_tax_condition: body.requester_tax_condition || 'consumidor_final',

          // Dirección
          address: body.address?.trim() || null,
          city: body.city?.trim() || null,
          province: body.province || 'Buenos Aires',
          postal_code: body.postal_code?.trim() || null,
          distance_km: (body as unknown as { distance_km?: number }).distance_km ?? null,
          is_free_shipping: (body as unknown as { is_free_shipping?: boolean }).is_free_shipping ?? false,

          // Datos de la caja
          length_mm: body.length_mm,
          width_mm: body.width_mm,
          height_mm: body.height_mm,
          quantity: body.quantity,
          has_printing: body.has_printing || false,
          printing_colors: body.printing_colors || 0,

          // Diseño
          design_file_url: body.design_file_url || null,
          design_file_name: body.design_file_name || null,
          design_preview_url: (body as { design_preview_url?: string }).design_preview_url || null,

          // Cálculos
          sheet_width_mm: unfolded.unfoldedWidth,
          sheet_length_mm: unfolded.unfoldedLength,
          sqm_per_box: unfolded.m2,
          total_sqm: totalSqm,
          price_per_m2: pricePerM2,
          unit_price: unitPrice,
          subtotal: subtotal,
          estimated_days: estimatedDays,

          // Tracking
          source_ip: sourceIp,
          source_user_agent: sourceUserAgent,
          message: body.message?.trim() || null,

          // Estado inicial - es cotización web porque pidió contacto
          status: 'pending',
          requested_contact: true,
        })
        .select()
        .single();

      quote = newQuote;
      error = insertError;
    }

    if (error) {
      console.error('Error saving public quote:', error);
      return NextResponse.json(
        { error: 'Error al guardar la cotización' },
        { status: 500 }
      );
    }

    // Enviar notificación por email (cotización completa con solicitud de contacto)
    await sendNotification({
      type: 'lead_with_contact',
      origin: 'Web',
      box: {
        length: body.length_mm,
        width: body.width_mm,
        height: body.height_mm,
      },
      quantity: body.quantity,
      totalArs: subtotal,
      contact: {
        name: body.requester_name,
        email: body.requester_email,
        phone: body.requester_phone,
        company: body.requester_company,
        notes: body.message,
      },
    }).catch(err => {
      console.error('Error sending quote notification:', err);
      // No fallar la request si falla el email
    });

    // Si es de alto valor, enviar notificación adicional
    if (subtotal >= 500000) {
      await sendNotification({
        type: 'high_value_quote',
        origin: 'Web',
        box: {
          length: body.length_mm,
          width: body.width_mm,
          height: body.height_mm,
        },
        quantity: body.quantity,
        totalArs: subtotal,
        ip: sourceIp,
      }).catch(err => {
        console.error('Error sending high value notification:', err);
      });
    }

    return NextResponse.json(quote, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/public/quotes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
