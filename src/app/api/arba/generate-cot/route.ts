import { NextRequest, NextResponse } from 'next/server';
import { generateCot, previewCot, regenerateCot } from '@/lib/arba';
import { isArbaCotEnabled } from '@/lib/config/system';

// POST /api/arba/generate-cot - Generar COT en ARBA
export async function POST(request: NextRequest) {
  try {
    const { order_id, preview, regenerate } = await request.json();

    if (!order_id) {
      return NextResponse.json(
        { error: 'Se requiere order_id' },
        { status: 400 }
      );
    }

    // Si es preview, no verificar ARBA
    if (preview) {
      const previewData = await previewCot(order_id);
      return NextResponse.json({ preview: true, data: previewData });
    }

    const enabled = await isArbaCotEnabled();
    if (!enabled) {
      return NextResponse.json(
        { error: 'ARBA COT no está habilitado' },
        { status: 400 }
      );
    }

    const result = regenerate
      ? await regenerateCot(order_id)
      : await generateCot(order_id);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error_message || 'Error al generar COT',
          validation_errors: result.validation_errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      cot_number: result.cot_number,
    });
  } catch (error) {
    console.error('Error generando COT:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
