import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isXubioEnabled, isArbaCotEnabled } from '@/lib/config/system';
import { createBalanceInvoice, createRemito, previewInvoice, previewRemito } from '@/lib/xubio';
import { generateCot, previewCot } from '@/lib/arba';
import type { DispatchOrderRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id]/dispatch - Preview de despacho
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();

    // Obtener orden
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        client:clients(*),
        items:order_items(*),
        vehicle:vehicles(*)
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    // Verificar estado
    if (order.status !== 'ready') {
      return NextResponse.json(
        { error: 'La orden debe estar en estado "Lista" para despachar' },
        { status: 400 }
      );
    }

    if (!order.quantities_confirmed) {
      return NextResponse.json(
        { error: 'Debe confirmar las cantidades antes de despachar' },
        { status: 400 }
      );
    }

    // Obtener previews
    const [xubioEnabled, arbaEnabled] = await Promise.all([
      isXubioEnabled(),
      isArbaCotEnabled(),
    ]);

    let invoicePreview = null;
    let remitoPreview = null;
    let cotPreview = null;

    try {
      invoicePreview = await previewInvoice(orderId, 'balance');
    } catch (e) {
      console.error('Error en preview de factura:', e);
    }

    try {
      remitoPreview = await previewRemito(orderId);
    } catch (e) {
      console.error('Error en preview de remito:', e);
    }

    try {
      cotPreview = await previewCot(orderId);
    } catch (e) {
      console.error('Error en preview de COT:', e);
    }

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        quantities_confirmed: order.quantities_confirmed,
        payment_scheme: order.payment_scheme,
        total: order.total,
        vehicle: order.vehicle,
      },
      client: order.client,
      integrations: {
        xubio_enabled: xubioEnabled,
        arba_enabled: arbaEnabled,
        xubio_deposit_invoice: order.xubio_deposit_invoice_number,
        xubio_balance_invoice: order.xubio_balance_invoice_number,
        xubio_remito: order.xubio_remito_number,
        cot_number: order.cot_number,
      },
      previews: {
        invoice: invoicePreview,
        remito: remitoPreview,
        cot: cotPreview,
      },
    });
  } catch (error) {
    console.error('Error obteniendo preview de despacho:', error);
    return NextResponse.json(
      { error: 'Error al obtener preview de despacho' },
      { status: 500 }
    );
  }
}

// POST /api/orders/[id]/dispatch - Ejecutar despacho
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: orderId } = await params;
    const supabase = await createClient();
    const body: DispatchOrderRequest = await request.json();

    // Verificar orden
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('status, quantities_confirmed, client_id, payment_scheme')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Orden no encontrada' },
        { status: 404 }
      );
    }

    if (order.status !== 'ready') {
      return NextResponse.json(
        { error: 'La orden debe estar en estado "Lista" para despachar' },
        { status: 400 }
      );
    }

    if (!order.quantities_confirmed) {
      return NextResponse.json(
        { error: 'Debe confirmar las cantidades antes de despachar' },
        { status: 400 }
      );
    }

    // Asignar vehículo
    if (body.vehicle_id) {
      await supabase
        .from('orders')
        .update({ vehicle_id: body.vehicle_id })
        .eq('id', orderId);
    }

    const results: {
      invoice?: { id: number; numero: string } | null;
      remito?: { id: number; numero: string } | null;
      cot?: { cot_number: string } | null;
      errors: string[];
    } = { errors: [] };

    // Generar factura si está habilitado
    if (body.generate_invoice) {
      const xubioEnabled = await isXubioEnabled();
      if (xubioEnabled) {
        try {
          const invoice = await createBalanceInvoice(orderId);
          results.invoice = { id: invoice.id, numero: invoice.numero };
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Error generando factura';
          results.errors.push(error);
        }
      } else {
        results.errors.push('Xubio no está habilitado para generar factura');
      }
    }

    // Generar remito si está habilitado
    if (body.generate_remito) {
      const xubioEnabled = await isXubioEnabled();
      if (xubioEnabled) {
        try {
          const remito = await createRemito(orderId);
          results.remito = { id: remito.id, numero: remito.numero };
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Error generando remito';
          results.errors.push(error);
        }
      } else {
        results.errors.push('Xubio no está habilitado para generar remito');
      }
    }

    // Generar COT si está habilitado
    if (body.generate_cot) {
      const arbaEnabled = await isArbaCotEnabled();
      if (arbaEnabled) {
        try {
          const cot = await generateCot(orderId);
          if (cot.success && cot.cot_number) {
            results.cot = { cot_number: cot.cot_number };
          } else {
            results.errors.push(cot.error_message || 'Error generando COT');
          }
        } catch (e) {
          const error = e instanceof Error ? e.message : 'Error generando COT';
          results.errors.push(error);
        }
      } else {
        results.errors.push('ARBA COT no está habilitado');
      }
    }

    // Actualizar estado de la orden a "shipped"
    await supabase
      .from('orders')
      .update({
        status: 'shipped',
        shipped_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return NextResponse.json({
      success: results.errors.length === 0,
      results,
      message: results.errors.length === 0
        ? 'Orden despachada correctamente'
        : 'Orden despachada con algunos errores',
    });
  } catch (error) {
    console.error('Error despachando orden:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al despachar orden' },
      { status: 500 }
    );
  }
}
