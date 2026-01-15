import { NextRequest, NextResponse } from 'next/server';
import { createDepositInvoice, createBalanceInvoice, previewInvoice } from '@/lib/xubio';
import { isXubioEnabled } from '@/lib/config/system';

// POST /api/xubio/create-invoice - Crear factura en Xubio
export async function POST(request: NextRequest) {
  try {
    const { order_id, type, preview } = await request.json();

    if (!order_id) {
      return NextResponse.json(
        { error: 'Se requiere order_id' },
        { status: 400 }
      );
    }

    if (!type || !['deposit', 'balance'].includes(type)) {
      return NextResponse.json(
        { error: 'Se requiere type (deposit o balance)' },
        { status: 400 }
      );
    }

    // Si es preview, no verificar Xubio
    if (preview) {
      const previewData = await previewInvoice(order_id, type);
      return NextResponse.json({ preview: true, data: previewData });
    }

    const enabled = await isXubioEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'Xubio no está habilitado' },
        { status: 400 }
      );
    }

    const invoice = type === 'deposit'
      ? await createDepositInvoice(order_id)
      : await createBalanceInvoice(order_id);

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        numero: invoice.numero,
        total: invoice.total,
        cae: invoice.cae,
      },
    });
  } catch (error) {
    console.error('Error creando factura:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
