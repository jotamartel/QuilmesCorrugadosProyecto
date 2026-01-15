import { NextRequest, NextResponse } from 'next/server';
import { createRemito, previewRemito, generateRemitoPrintHtml } from '@/lib/xubio';
import { isXubioEnabled } from '@/lib/config/system';

// POST /api/xubio/create-remito - Crear remito en Xubio
export async function POST(request: NextRequest) {
  try {
    const { order_id, preview, print } = await request.json();

    if (!order_id) {
      return NextResponse.json(
        { error: 'Se requiere order_id' },
        { status: 400 }
      );
    }

    // Si es preview, no verificar Xubio
    if (preview) {
      const previewData = await previewRemito(order_id);
      return NextResponse.json({ preview: true, data: previewData });
    }

    // Si es para imprimir, generar HTML
    if (print) {
      const html = await generateRemitoPrintHtml(order_id);
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const enabled = await isXubioEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'Xubio no está habilitado' },
        { status: 400 }
      );
    }

    const remito = await createRemito(order_id);

    return NextResponse.json({
      success: true,
      remito: {
        id: remito.id,
        numero: remito.numero,
      },
    });
  } catch (error) {
    console.error('Error creando remito:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
