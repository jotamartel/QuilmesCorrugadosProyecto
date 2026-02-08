/**
 * API Pública: /api/public/leads
 * Registrar leads cuando el usuario quiere ver la cotización
 * (captura datos para remarketing antes de mostrar precio)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal } from '@/lib/utils/pricing';
import { sendNotification } from '@/lib/notifications';
import type { PricingConfig } from '@/lib/types/database';

interface BoxData {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;
  design_file_url?: string;
  design_file_name?: string;
  design_preview_url?: string;
}

interface LeadRequest {
  // Datos del cliente
  client_type: 'empresa' | 'particular';
  requester_name: string;
  requester_company?: string;
  requester_email: string;
  requester_phone: string;
  requester_cuit?: string;
  requester_tax_condition?: string;
  // Dirección (opcional)
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  distance_km?: number | null;
  // Cajas
  boxes: BoxData[];
  // Mensaje
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: LeadRequest = await request.json();

    // ═══════════════════════════════════════════════════════════
    // VALIDACIONES
    // ═══════════════════════════════════════════════════════════

    const errors: string[] = [];

    if (!body.requester_name?.trim() || body.requester_name.trim().length < 3) {
      errors.push('El nombre es requerido (mínimo 3 caracteres)');
    }
    if (!body.requester_email?.trim()) {
      errors.push('El email es requerido');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.requester_email)) {
      errors.push('El email no es válido');
    }
    if (!body.requester_phone?.trim() || body.requester_phone.replace(/\D/g, '').length < 8) {
      errors.push('El teléfono es requerido (mínimo 8 dígitos)');
    }

    if (!body.boxes || body.boxes.length === 0) {
      errors.push('Debe incluir al menos una caja');
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
    // CALCULAR TOTALES PARA TODAS LAS CAJAS
    // ═══════════════════════════════════════════════════════════

    let totalSqmAll = 0;
    const boxCalculations = body.boxes.map(box => {
      const unfolded = calculateUnfolded(box.length_mm, box.width_mm, box.height_mm);
      const totalSqm = calculateTotalM2(unfolded.m2, box.quantity);
      totalSqmAll += totalSqm;
      return {
        ...box,
        design_file_url: box.design_file_url || null,
        design_file_name: box.design_file_name || null,
        design_preview_url: box.design_preview_url || null,
        sheetWidth: unfolded.unfoldedWidth,
        sheetLength: unfolded.unfoldedLength,
        sqmPerBox: unfolded.m2,
        totalSqm,
      };
    });

    const pricePerM2 = getPricePerM2(totalSqmAll, config);
    const totalSubtotal = calculateSubtotal(totalSqmAll, pricePerM2);

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR METADATA
    // ═══════════════════════════════════════════════════════════

    const sourceIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const sourceUserAgent = request.headers.get('user-agent') || 'unknown';

    // ═══════════════════════════════════════════════════════════
    // GUARDAR EN PUBLIC_QUOTES (como lead con precio revelado)
    // ═══════════════════════════════════════════════════════════

    const firstBox = boxCalculations[0];
    const hasPrinting = body.boxes.some(b => b.has_printing);
    const estimatedDays = hasPrinting ? (config.production_days_printing || 14) : (config.production_days_standard || 7);

    const { data: quote, error: insertError } = await supabase
      .from('public_quotes')
      .insert({
        requester_name: body.requester_name.trim(),
        requester_company: body.requester_company?.trim() || null,
        requester_email: body.requester_email.trim().toLowerCase(),
        requester_phone: body.requester_phone.replace(/\D/g, ''),
        requester_cuit: body.requester_cuit?.replace(/\D/g, '') || null,
        requester_tax_condition: body.requester_tax_condition || 'consumidor_final',
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        province: body.province || 'Buenos Aires',
        postal_code: body.postal_code?.trim() || null,
        distance_km: body.distance_km ?? null,
        is_free_shipping: body.distance_km ? body.distance_km <= 60 : false,
        requested_contact: false, // Lead: solo vio el precio, no pidió contacto
        length_mm: firstBox.length_mm,
        width_mm: firstBox.width_mm,
        height_mm: firstBox.height_mm,
        quantity: firstBox.quantity,
        has_printing: firstBox.has_printing,
        printing_colors: firstBox.printing_colors || 0,
        // Guardar diseño si existe
        design_file_url: firstBox.design_file_url || null,
        design_file_name: firstBox.design_file_name || null,
        design_preview_url: firstBox.design_preview_url || null,
        sheet_width_mm: firstBox.sheetWidth,
        sheet_length_mm: firstBox.sheetLength,
        sqm_per_box: firstBox.sqmPerBox,
        total_sqm: totalSqmAll,
        price_per_m2: pricePerM2,
        unit_price: Math.round((totalSubtotal / firstBox.quantity) * 100) / 100,
        subtotal: totalSubtotal,
        estimated_days: estimatedDays,
        source_ip: sourceIp,
        source_user_agent: sourceUserAgent,
        message: body.message?.trim() || null,
        status: 'pending', // Lead que vio precio, pendiente de seguimiento
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting lead to public_quotes:', insertError);
      return NextResponse.json(
        { error: 'Error al guardar el lead: ' + insertError.message },
        { status: 500 }
      );
    }

    // Enviar notificación por email (lead que vio precio)
    const leadBox = body.boxes[0];
    await sendNotification({
      type: 'lead_with_contact',
      origin: 'Web',
      box: {
        length: leadBox.length_mm,
        width: leadBox.width_mm,
        height: leadBox.height_mm,
      },
      quantity: leadBox.quantity,
      totalArs: totalSubtotal,
      contact: {
        name: body.requester_name,
        email: body.requester_email,
        phone: body.requester_phone,
        company: body.requester_company,
        notes: body.message,
      },
    }).catch(err => {
      console.error('Error sending lead notification:', err);
      // No fallar la request si falla el email
    });

    // Devolver los cálculos para mostrar en el frontend
    return NextResponse.json({
      id: quote.id,
      totalSqm: totalSqmAll,
      totalSubtotal,
      pricePerM2,
      boxes: boxCalculations,
    }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/public/leads:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
