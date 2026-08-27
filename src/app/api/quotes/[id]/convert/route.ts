/**
 * API: POST /api/quotes/[id]/convert
 * Convierte una cotización aprobada en orden
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDeliveryDate, toISODateString } from '@/lib/utils/dates';
import { repartirElPago, baseDeLaSena } from '@/lib/pagos/esquemas';
import { IVA } from '@/lib/cotizacion/motor';
import { reportarVentaAMeta } from '@/lib/marketing/conversiones';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = createAdminClient();

    // Obtener cotización con todos los datos
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select(`
        *,
        client:clients(*),
        items:quote_items(*)
      `)
      .eq('id', id)
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { error: 'Cotización no encontrada' },
        { status: 404 }
      );
    }

    // Verificar que está aprobada
    if (quote.status !== 'approved') {
      return NextResponse.json(
        { error: `Solo se pueden convertir cotizaciones aprobadas. Estado actual: "${quote.status}"` },
        { status: 400 }
      );
    }

    // Verificar que no fue convertida ya
    if (quote.converted_to_order_id) {
      return NextResponse.json(
        { error: 'Esta cotización ya fue convertida en orden' },
        { status: 400 }
      );
    }

    // Generar número de orden
    const { data: orderNumber, error: seqError } = await supabase
      .rpc('generate_order_number');

    if (seqError) {
      console.error('Error generating order number:', seqError);
      return NextResponse.json(
        { error: 'Error al generar número de orden' },
        { status: 500 }
      );
    }

    // El reparto sale de @/lib/pagos/esquemas, unico dueño del porcentaje y de
    // sobre que total se aplica. quote.total es NETO, igual que orders.total.
    const totalConIva = Math.round(Number(quote.total) * (1 + IVA) * 100) / 100;
    const { alConfirmar: depositAmount, contraEntrega: balanceAmount } =
      repartirElPago(baseDeLaSena(Number(quote.total), totalConIva));

    // Crear orden
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        quote_id: quote.id,
        client_id: quote.client_id,
        status: 'pending_deposit',
        // Sin esto, toda orden convertida caeria en el default 'manual' de la
        // migracion 037 y la marca web/manual mentiria justo al reves.
        channel: quote.channel,
        pricing_mode: 'motor',
        total_m2: quote.total_m2,
        subtotal: quote.subtotal,
        printing_cost: quote.printing_cost,
        die_cut_cost: quote.die_cut_cost,
        shipping_cost: quote.shipping_cost,
        total: quote.total,
        deposit_amount: depositAmount,
        deposit_status: 'pending',
        balance_amount: balanceAmount,
        balance_status: 'pending',
        delivery_address: body.delivery_address || quote.client?.address || null,
        delivery_city: body.delivery_city || quote.client?.city || null,
        delivery_notes: body.delivery_notes || null,
        // Fallback para las quotes que quedaron sin fecha: el convert de las
        // cotizaciones web copiaba production_days pero nunca calculaba el dia,
        // y por eso 3 de las 7 ordenes vivas nacieron con esto en null. Un
        // pedido sin fecha comprometida es un pedido que nadie puede priorizar.
        estimated_delivery:
          quote.estimated_delivery ??
          toISODateString(calculateDeliveryDate(quote.production_days ?? 7)),
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      return NextResponse.json(
        { error: 'Error al crear la orden' },
        { status: 500 }
      );
    }

    // Copiar items de cotización a orden
    const orderItems = quote.items.map((item: {
      length_mm: number;
      width_mm: number;
      height_mm: number;
      m2_per_box: number;
      quantity: number;
      total_m2: number;
    }) => ({
      order_id: order.id,
      length_mm: item.length_mm,
      width_mm: item.width_mm,
      height_mm: item.height_mm,
      m2_per_box: item.m2_per_box,
      quantity: item.quantity,
      total_m2: item.total_m2,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', itemsError);
      // Rollback: eliminar la orden
      await supabase.from('orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: 'Error al crear los items de la orden' },
        { status: 500 }
      );
    }

    // Actualizar cotización como convertida
    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'converted',
        converted_to_order_id: order.id,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating quote:', updateError);
    }

    // Cerrar el loop publicitario. Si esta cotización nació de un lead del
    // cotizador o del bot (public_quotes), ESTE es el momento de la venta:
    // la orden existe, con su monto real. El único otro disparo de
    // reportarVentaAMeta vive en el PATCH de public_quotes, que el circuito
    // B2B no usa — por eso las ventas que cerraban por acá nunca volvían
    // como señal a las plataformas. El event_id se arma con el id del lead,
    // así Meta deduplica si algún día los dos caminos disparan por el mismo
    // pedido. Es telemetría: nunca puede voltear la conversión.
    try {
      const { data: leadOrigen } = await supabase
        .from('public_quotes')
        .select('id, quote_number, requester_email, requester_phone, gclid, fbclid, created_at')
        .eq('converted_to_quote_id', id)
        .maybeSingle();

      if (leadOrigen) {
        const resultado = await reportarVentaAMeta({
          quoteId: leadOrigen.id,
          quoteNumber: leadOrigen.quote_number,
          monto: Number(quote.total),
          email: leadOrigen.requester_email,
          telefono: leadOrigen.requester_phone,
          gclid: leadOrigen.gclid ?? null,
          fbclid: leadOrigen.fbclid ?? null,
          cotizadoEn: leadOrigen.created_at,
          cerradoEn: new Date().toISOString(),
        });
        console.log(
          '[Convert] venta reportada a Meta (lead %s): %s',
          leadOrigen.quote_number,
          resultado.detalle,
        );
      }
    } catch (e) {
      console.error('[Convert] no se pudo reportar la venta a Meta:', e);
    }

    // Registrar comunicación
    await supabase.from('communications').insert({
      client_id: quote.client_id,
      quote_id: quote.id,
      order_id: order.id,
      channel: 'manual',
      direction: 'outbound',
      subject: 'Orden creada',
      content: `Cotización ${quote.quote_number} convertida a orden ${orderNumber}`,
      metadata: {
        quote_number: quote.quote_number,
        order_number: orderNumber,
      },
    });

    // Obtener orden completa
    const { data: fullOrder } = await supabase
      .from('orders')
      .select(`
        *,
        client:clients(id, name, company),
        quote:quotes(id, quote_number),
        items:order_items(*)
      `)
      .eq('id', order.id)
      .single();

    return NextResponse.json({
      success: true,
      order: fullOrder,
      message: `Cotización ${quote.quote_number} convertida a orden ${orderNumber}`,
    });
  } catch (error) {
    console.error('Error in POST /api/quotes/[id]/convert:', error);
    return NextResponse.json(
      { error: 'Error al convertir la cotización' },
      { status: 500 }
    );
  }
}
