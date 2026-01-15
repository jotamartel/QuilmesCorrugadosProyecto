/**
 * API: /api/quotes
 * GET - Lista cotizaciones
 * POST - Crea una nueva cotización
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  calculateUnfolded,
  isOversized,
  calculateTotalM2,
} from '@/lib/utils/box-calculations';
import {
  getPricePerM2,
  calculateSubtotal,
  getShippingNotes,
  getProductionDays,
  calculateTotal,
} from '@/lib/utils/pricing';
import { calculateDeliveryDate, calculateValidUntil, toISODateString } from '@/lib/utils/dates';
import type { CreateQuoteRequest, PricingConfig, QuoteStatus } from '@/lib/types/database';

// GET /api/quotes - Lista cotizaciones
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros de filtro
    const status = searchParams.get('status') as QuoteStatus | null;
    const clientId = searchParams.get('client_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir query
    let query = supabase
      .from('quotes')
      .select(`
        *,
        client:clients(id, name, company)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Aplicar filtros
    if (status) {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (from) {
      query = query.gte('created_at', from);
    }

    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching quotes:', error);
      return NextResponse.json(
        { error: 'Error al obtener cotizaciones' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data,
      pagination: {
        total: count,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/quotes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/quotes - Crear cotización
export async function POST(request: NextRequest) {
  try {
    const body: CreateQuoteRequest = await request.json();

    // Validar items
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Debe incluir al menos un item' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Obtener configuración de precios activa
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

    // Obtener distancia del cliente si existe
    let clientDistanceKm: number | null = null;
    if (body.client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('distance_km')
        .eq('id', body.client_id)
        .single();

      if (clientData) {
        clientDistanceKm = clientData.distance_km;
      }
    }

    // Procesar items
    const processedItems: Array<{
      box_id: string | null;
      length_mm: number;
      width_mm: number;
      height_mm: number;
      unfolded_length_mm: number;
      unfolded_width_mm: number;
      m2_per_box: number;
      quantity: number;
      total_m2: number;
      is_custom: boolean;
      is_oversized: boolean;
    }> = [];

    let grandTotalM2 = 0;

    for (const item of body.items) {
      const { length_mm, width_mm, height_mm, quantity, box_id } = item;

      const { unfoldedWidth, unfoldedLength, m2 } = calculateUnfolded(
        length_mm,
        width_mm,
        height_mm
      );

      const totalM2 = calculateTotalM2(m2, quantity);
      const oversized = isOversized(length_mm, width_mm, height_mm);

      processedItems.push({
        box_id: box_id || null,
        length_mm,
        width_mm,
        height_mm,
        unfolded_length_mm: unfoldedLength,
        unfolded_width_mm: unfoldedWidth,
        m2_per_box: m2,
        quantity,
        total_m2: totalM2,
        is_custom: !box_id,
        is_oversized: oversized,
      });

      grandTotalM2 += totalM2;
    }

    // Calcular totales
    const pricePerM2 = getPricePerM2(grandTotalM2, config);
    const subtotal = calculateSubtotal(grandTotalM2, pricePerM2);
    const printingCost = body.has_printing && !body.has_existing_polymer ? 0 : 0;
    const dieCutCost = body.die_cut_cost || 0;
    const shippingCost = body.shipping_cost || 0;
    const shippingNotes = body.shipping_notes || getShippingNotes(grandTotalM2, clientDistanceKm, config);
    const total = calculateTotal(subtotal, printingCost, dieCutCost, shippingCost);

    const hasPrinting = body.has_printing || false;
    const productionDays = getProductionDays(hasPrinting, config);
    const estimatedDelivery = calculateDeliveryDate(productionDays);
    const validUntil = calculateValidUntil(config.quote_validity_days);

    // Generar número de cotización
    const { data: quoteNumber, error: seqError } = await supabase
      .rpc('generate_quote_number');

    if (seqError) {
      console.error('Error generating quote number:', seqError);
      return NextResponse.json(
        { error: 'Error al generar número de cotización' },
        { status: 500 }
      );
    }

    // Crear cotización
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        client_id: body.client_id || null,
        status: 'draft',
        channel: body.channel || 'manual',
        total_m2: Math.round(grandTotalM2 * 10000) / 10000,
        price_per_m2: pricePerM2,
        subtotal,
        has_printing: hasPrinting,
        printing_colors: body.printing_colors || 0,
        printing_cost: printingCost,
        has_existing_polymer: body.has_existing_polymer || false,
        has_die_cut: body.has_die_cut || false,
        die_cut_cost: dieCutCost,
        shipping_cost: shippingCost,
        shipping_notes: shippingNotes,
        total,
        production_days: productionDays,
        estimated_delivery: toISODateString(estimatedDelivery),
        valid_until: toISODateString(validUntil),
        notes: body.notes || null,
        internal_notes: body.internal_notes || null,
      })
      .select()
      .single();

    if (quoteError) {
      console.error('Error creating quote:', quoteError);
      return NextResponse.json(
        { error: 'Error al crear la cotización' },
        { status: 500 }
      );
    }

    // Crear items de cotización
    const itemsToInsert = processedItems.map(item => ({
      quote_id: quote.id,
      ...item,
    }));

    const { error: itemsError } = await supabase
      .from('quote_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Error creating quote items:', itemsError);
      // Rollback: eliminar la cotización
      await supabase.from('quotes').delete().eq('id', quote.id);
      return NextResponse.json(
        { error: 'Error al crear los items de la cotización' },
        { status: 500 }
      );
    }

    // Obtener cotización completa con items
    const { data: fullQuote } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(id, name, company),
        items:quote_items(*)
      `)
      .eq('id', quote.id)
      .single();

    return NextResponse.json(fullQuote, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/quotes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
