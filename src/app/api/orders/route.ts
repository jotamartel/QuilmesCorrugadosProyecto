/**
 * API: /api/orders
 * GET  - Lista órdenes
 * POST - Crea una orden SIN cotización previa (pedidos por teléfono/mostrador)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DATA_START_DATE } from '@/lib/utils/constants';
import { calculateUnfolded, calculateTotalM2 } from '@/lib/utils/box-calculations';
import { getPricePerM2, calculateSubtotal, calculateTotal, getProductionDays, getActivePricingConfig } from '@/lib/utils/pricing';
import { calculateDeliveryDate, toISODateString } from '@/lib/utils/dates';
import { porQueNoSeFabrica } from '@/lib/cotizacion/motor';
import { repartirElPago } from '@/lib/pagos/esquemas';
import type { OrderStatus, CreateOrderRequest, PaymentMethod } from '@/lib/types/database';

// GET /api/orders - Lista órdenes
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Parámetros de filtro
    const status = searchParams.get('status') as OrderStatus | null;
    const clientId = searchParams.get('client_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Construir query
    let query = supabase
      .from('orders')
      .select(`
        *,
        client:clients(id, name, company, whatsapp, whatsapp_optout),
        quote:quotes(id, quote_number)
      `, { count: 'exact' })
      .gte('created_at', DATA_START_DATE)
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
      console.error('Error fetching orders:', error);
      return NextResponse.json(
        { error: 'Error al obtener órdenes' },
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
    console.error('Error in GET /api/orders:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// POST /api/orders — crear una orden a mano, sin cotización previa.
//
// Existe porque la única puerta era convertir una cotización aprobada, y los
// pedidos que entran por teléfono o mostrador —la mayoría de la operación—
// quedaban afuera del sistema (punto 11 de lo acordado con el dueño).
//
// LOS DOS MODOS DE PRECIO, EXPLÍCITOS:
//   'motor'  — lo calculan las mismas primitivas que /api/quotes/calculate.
//   'manual' — lo escribe el vendedor (pedido negociado). No se valida
//              coherencia contra los items A PROPÓSITO: validar el precio
//              negociado sería devolverle el poder al motor.
//
// La GEOMETRÍA no se negocia en ningún modo: m² y plancha salen del motor, y
// una caja que la fábrica no puede producir se rechaza aunque el precio sea
// manual — un precio negociado no agranda el rollo de 1.200 mm.
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body: CreateOrderRequest = await request.json();

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'La orden necesita al menos un item' }, { status: 400 });
    }
    if (body.pricing_mode !== 'motor' && body.pricing_mode !== 'manual') {
      return NextResponse.json({ error: "pricing_mode debe ser 'motor' o 'manual'" }, { status: 400 });
    }

    const initialStatus = body.initial_status ?? 'pending_deposit';
    if (initialStatus !== 'pending_deposit' && initialStatus !== 'confirmed') {
      // Nacer en in_production saltearía la máquina de estados y sus
      // timestamps: a los demás estados se llega por las transiciones.
      return NextResponse.json(
        { error: "El estado inicial solo puede ser 'pending_deposit' o 'confirmed'" },
        { status: 400 },
      );
    }
    const metodosValidos: PaymentMethod[] = ['transferencia', 'cheque', 'efectivo', 'echeq'];
    if (initialStatus === 'confirmed' && !metodosValidos.includes(body.deposit?.method as PaymentMethod)) {
      // 'confirmed' implica seña cobrada: es la regla que el endpoint /status
      // ya impone, y nacer confirmado no puede saltearla.
      return NextResponse.json(
        { error: 'Para crear la orden ya confirmada hay que registrar la seña: falta deposit.method' },
        { status: 400 },
      );
    }

    // ── Geometría, siempre del motor ────────────────────────────────────────
    for (const item of body.items) {
      const { length_mm, width_mm, height_mm, quantity } = item;
      if (!length_mm || !width_mm || !height_mm || !quantity || quantity < 1) {
        return NextResponse.json(
          { error: 'Cada item necesita length_mm, width_mm, height_mm y quantity positivos' },
          { status: 400 },
        );
      }
      const motivos = porQueNoSeFabrica({ length_mm, width_mm, height_mm, quantity });
      if (motivos.length > 0) {
        return NextResponse.json(
          { error: `La caja ${length_mm}x${width_mm}x${height_mm} no se puede fabricar: ${motivos.join('; y ')}.` },
          { status: 400 },
        );
      }
    }

    const itemsConGeometria = body.items.map((item) => {
      const u = calculateUnfolded(item.length_mm, item.width_mm, item.height_mm);
      return { ...item, m2_per_box: u.m2, total_m2: calculateTotalM2(u.m2, item.quantity) };
    });
    const totalM2 = Math.round(itemsConGeometria.reduce((s, i) => s + i.total_m2, 0) * 10000) / 10000;

    // ── Precio, según el modo ───────────────────────────────────────────────
    const config = await getActivePricingConfig();
    if (!config) {
      return NextResponse.json({ error: 'No hay configuración de precios activa' }, { status: 500 });
    }

    let subtotal: number;
    let printingCost: number;
    let dieCutCost: number;
    let shippingCost: number;
    let total: number;

    if (body.pricing_mode === 'motor') {
      if (totalM2 < config.min_m2_pedido) {
        // El motor no cotiza por debajo del mínimo. No se cae automático a
        // manual: esa decisión es del vendedor, que la toma viendo este error.
        return NextResponse.json(
          {
            error:
              `El pedido son ${totalM2.toLocaleString('es-AR')} m² y el mínimo es ` +
              `${config.min_m2_pedido.toLocaleString('es-AR')} m²: el motor no lo cotiza.`,
            hint: 'Si es un pedido negociado, cargalo con precio manual.',
          },
          { status: 400 },
        );
      }
      const pricePerM2 = getPricePerM2(totalM2, config);
      subtotal = calculateSubtotal(totalM2, pricePerM2);
      printingCost = 0; // el polímero se carga aparte cuando se cotiza
      dieCutCost = 0;
      shippingCost = 0;
      total = calculateTotal(subtotal, printingCost, dieCutCost, shippingCost);
    } else {
      const mp = body.manual_pricing;
      if (!mp || !(mp.subtotal > 0) || !(mp.total > 0)) {
        return NextResponse.json(
          { error: 'Con precio manual hay que mandar manual_pricing con subtotal y total mayores a 0' },
          { status: 400 },
        );
      }
      subtotal = Math.round(mp.subtotal * 100) / 100;
      printingCost = Math.round((mp.printing_cost ?? 0) * 100) / 100;
      dieCutCost = Math.round((mp.die_cut_cost ?? 0) * 100) / 100;
      shippingCost = Math.round((mp.shipping_cost ?? 0) * 100) / 100;
      total = Math.round(mp.total * 100) / 100;
    }

    // ── Seña y saldo ────────────────────────────────────────────────────────
    //
    // La condicion sale de @/lib/pagos/esquemas, que es el unico lugar donde
    // vive el porcentaje. Si al crear la orden ya se cobro otra cosa manda lo
    // cobrado: dos de las siete ordenes que hay tienen seña de 47,6% y 49,1%
    // porque se registro lo que la persona efectivamente transfirio.
    const condicion = repartirElPago(total);
    const depositAmount =
      initialStatus === 'confirmed' && typeof body.deposit?.amount === 'number' && body.deposit.amount > 0
        ? Math.round(body.deposit.amount * 100) / 100
        : condicion.alConfirmar;
    const balanceAmount = Math.round((total - depositAmount) * 100) / 100;
    const now = new Date().toISOString();

    const hasPrinting = body.has_printing || (body.printing_colors ?? 0) > 0;
    const estimatedDelivery =
      body.estimated_delivery ||
      // Con precio del motor la fecha sale de los días de producción; con
      // precio manual sin fecha queda null y se fija desde el panel.
      (body.pricing_mode === 'motor'
        ? toISODateString(calculateDeliveryDate(getProductionDays(hasPrinting, config)))
        : null);

    const { data: orderNumber, error: numError } = await supabase.rpc('generate_order_number');
    if (numError || !orderNumber) {
      console.error('Error generando número de orden:', numError);
      return NextResponse.json({ error: 'Error al generar el número de orden' }, { status: 500 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        quote_id: null,
        client_id: body.client_id || null,
        status: initialStatus,
        channel: body.channel ?? 'manual',
        pricing_mode: body.pricing_mode,
        total_m2: totalM2,
        subtotal,
        printing_cost: printingCost,
        die_cut_cost: dieCutCost,
        shipping_cost: shippingCost,
        total,
        deposit_amount: depositAmount,
        deposit_status: initialStatus === 'confirmed' ? 'paid' : 'pending',
        deposit_method: initialStatus === 'confirmed' ? body.deposit!.method : null,
        deposit_paid_at: initialStatus === 'confirmed' ? body.deposit?.paid_at || now : null,
        balance_amount: balanceAmount,
        balance_status: 'pending',
        delivery_address: body.delivery_address || null,
        delivery_city: body.delivery_city || null,
        delivery_notes: body.delivery_notes || null,
        estimated_delivery: estimatedDelivery,
        confirmed_at: initialStatus === 'confirmed' ? now : null,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error('Error creando orden manual:', orderError);
      return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 });
    }

    const { error: itemsError } = await supabase.from('order_items').insert(
      itemsConGeometria.map((i) => ({
        order_id: order.id,
        length_mm: i.length_mm,
        width_mm: i.width_mm,
        height_mm: i.height_mm,
        m2_per_box: i.m2_per_box,
        quantity: i.quantity,
        total_m2: i.total_m2,
      })),
    );
    if (itemsError) {
      // Sin los items la orden es un cascarón que rompe el detalle: se borra.
      await supabase.from('orders').delete().eq('id', order.id);
      console.error('Error creando items de la orden manual:', itemsError);
      return NextResponse.json({ error: 'Error al crear los items de la orden' }, { status: 500 });
    }

    // La seña cobrada al crear también deja fila en payments, como cualquier
    // pago (la lección de la etapa 4: payments no puede mentir).
    if (initialStatus === 'confirmed') {
      await supabase.from('payments').insert({
        order_id: order.id,
        client_id: body.client_id || null,
        type: 'deposit',
        amount: depositAmount,
        method: body.deposit!.method,
        status: 'completed',
        notes: 'Seña cobrada antes de cargar el pedido en el sistema',
      });
    }

    await supabase.from('communications').insert({
      client_id: body.client_id || null,
      order_id: order.id,
      // channel de communications es otro dominio que el de la orden; 'manual'
      // acá significa "lo hizo una persona desde el panel".
      channel: 'manual',
      direction: 'outbound',
      subject: 'Orden creada a mano',
      content:
        `Pedido ${orderNumber} cargado desde el panel` +
        `${body.pricing_mode === 'manual' ? ', con precio negociado' : ''}` +
        `${body.notes ? `. Notas: ${body.notes}` : ''}`,
      metadata: {
        order_number: orderNumber,
        pricing_mode: body.pricing_mode,
        channel: body.channel ?? 'manual',
        initial_status: initialStatus,
      },
    });

    const { data: fullOrder } = await supabase
      .from('orders')
      .select('*, client:clients(id, name, company), items:order_items(*)')
      .eq('id', order.id)
      .single();

    return NextResponse.json({ success: true, order: fullOrder ?? order });
  } catch (error) {
    console.error('Error in POST /api/orders:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
