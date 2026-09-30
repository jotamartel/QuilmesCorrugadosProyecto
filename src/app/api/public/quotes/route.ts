/**
 * API Pública: /api/public/quotes
 * Crear cotizaciones desde el sitio web público (sin autenticación)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProductionDays } from '@/lib/utils/pricing';
import { calcularCajasWeb, type CajaDelFormulario } from '@/lib/cotizacion/web';
import { porQueNoSeFabrica } from '@/lib/cotizacion/motor';
import { sendNotification } from '@/lib/notifications';
import { notifyNewRetailLead } from '@/lib/telegram/notifications';
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

    // Dimensiones de la caja: los límites reales de fabricación, los mismos
    // del motor. Acá había topes viejos escritos a mano (800x600x600) y el
    // botón "Quiero que me contacten" rechazaba cajas que el formulario ya
    // había cotizado, como una de 1030x500x620 para sillas: la persona veía
    // el precio y después no podía pedir que la llamen.
    const cajaPrincipal: CajaDelFormulario = {
      length_mm: body.length_mm,
      width_mm: body.width_mm,
      height_mm: body.height_mm,
      quantity: body.quantity,
      has_printing: body.has_printing,
      printing_colors: body.printing_colors,
      material: (body as { material?: unknown }).material,
      design_file_url: body.design_file_url,
      design_file_name: body.design_file_name,
      design_preview_url: (body as { design_preview_url?: string }).design_preview_url,
    };
    const adicionalesCrudas = (body as { additional_boxes?: unknown }).additional_boxes;
    const adicionales: CajaDelFormulario[] = Array.isArray(adicionalesCrudas)
      ? (adicionalesCrudas as CajaDelFormulario[]).slice(0, 20)
      : [];
    for (const [i, caja] of [cajaPrincipal, ...adicionales].entries()) {
      const cual = adicionales.length ? `Caja ${i + 1}: ` : '';
      if (!caja.length_mm || !caja.width_mm || !caja.height_mm) {
        errors.push(`${cual}Faltan medidas: hacen falta largo, ancho y alto en milímetros`);
        continue;
      }
      if (!caja.quantity || caja.quantity < 1) {
        errors.push(`${cual}La cantidad debe ser al menos 1 unidad`);
      }
      const motivos = porQueNoSeFabrica({
        length_mm: caja.length_mm, width_mm: caja.width_mm, height_mm: caja.height_mm, quantity: caja.quantity,
      });
      if (motivos.length) errors.push(`${cual}Esa caja no se puede fabricar: ${motivos.join('; y ')}`);
    }
    // El minimo no se mide en cajas sino en m² de carton, y eso depende de la
    // medida: 100 cajas chicas son 34 m² y 100 grandes pasan los 100 m². El
    // control por superficie lo hace el motor de cotizacion mas abajo.
    if (!body.quantity || body.quantity < 1) {
      errors.push('La cantidad debe ser al menos 1 unidad');
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

    // Todas las medidas del pedido, cada una con su precio (ver
    // cotizacion/web.ts). Las adicionales llegaban en additional_boxes y se
    // tiraban: quien pedía tres medidas quedaba registrado con una.
    const { items, total_sqm: totalSqm, subtotal } = calcularCajasWeb([cajaPrincipal, ...adicionales], config);
    const primera = items[0];

    // Días de producción: con impresión en cualquier medida, el plazo largo.
    const estimatedDays = getProductionDays(items.some((i) => i.has_printing), config);

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
          // Las cajas y el precio, por si volvió al paso 1 y cambió algo
          // después de ver el precio: el vendedor tiene que llamar por lo que
          // la persona pidió al final.
          length_mm: primera.length_mm,
          width_mm: primera.width_mm,
          height_mm: primera.height_mm,
          quantity: primera.quantity,
          has_printing: primera.has_printing,
          printing_colors: primera.printing_colors,
          material: primera.material,
          sheet_width_mm: primera.sheet_width_mm,
          sheet_length_mm: primera.sheet_length_mm,
          sqm_per_box: primera.sqm_per_box,
          price_per_m2: primera.price_per_m2,
          unit_price: primera.unit_price,
          items,
          total_sqm: totalSqm,
          subtotal,
          estimated_days: estimatedDays,
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

          // Datos de la caja: la primera medida en las columnas de siempre, y
          // el pedido entero en items.
          length_mm: primera.length_mm,
          width_mm: primera.width_mm,
          height_mm: primera.height_mm,
          quantity: primera.quantity,
          has_printing: primera.has_printing,
          printing_colors: primera.printing_colors,
          material: primera.material,
          items,

          // Diseño
          design_file_url: body.design_file_url || null,
          design_file_name: body.design_file_name || null,
          design_preview_url: (body as { design_preview_url?: string }).design_preview_url || null,

          // Cálculos
          sheet_width_mm: primera.sheet_width_mm,
          sheet_length_mm: primera.sheet_length_mm,
          sqm_per_box: primera.sqm_per_box,
          total_sqm: totalSqm,
          price_per_m2: primera.price_per_m2,
          unit_price: primera.unit_price,
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

    // Solo enviar notificación si es un lead NUEVO (no actualizado)
    // Si es un lead existente que se actualizó, ya se envió el email cuando vio el precio
    if (!existingLead) {
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

      // Notificar por Telegram
      try {
        await notifyNewRetailLead({
          quoteId: quote.id,
          quoteNumber: quote.quote_number,
          clientType: body.requester_company ? 'empresa' : 'particular',
          nombre: body.requester_name.trim(),
          empresa: body.requester_company?.trim() || null,
          email: body.requester_email.trim(),
          telefono: body.requester_phone,
          cuit: body.requester_cuit || null,
          boxes: items.map((b) => ({
            largo: b.length_mm,
            ancho: b.width_mm,
            alto: b.height_mm,
            cantidad: b.quantity,
            precioUnitario: b.unit_price,
            subtotal: b.subtotal,
            m2PerBox: b.sqm_per_box,
            totalM2: b.total_sqm,
            isMayorista: true,
          })),
          shippingMethod: null,
          shippingCost: 0,
          shippingCostConfirmed: false,
          source: 'mayorista',
        });
      } catch (err) {
        console.error('[Telegram] Error notificando cotizacion mayorista:', err);
      }

      // Si es de alto valor, enviar notificación adicional
      if (subtotal >= 3000000) {
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
