import { NextRequest, NextResponse } from 'next/server';
import { generateBoxTemplate } from '@/lib/box-template-generator';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const length = parseInt(searchParams.get('length') || '400');
  const width = parseInt(searchParams.get('width') || '300');
  const height = parseInt(searchParams.get('height') || '300');

  // Validar dimensiones (alineado con whatsapp: ancho+alto ≤1200, mínimos 200x200x100)
  if (length < 200 || width < 200 || height < 100) {
    return NextResponse.json(
      { error: 'Dimensiones mínimas: 200×200×100 mm' },
      { status: 400 }
    );
  }
  if (width + height > 1200) {
    return NextResponse.json(
      { error: 'Ancho + Alto no puede superar 1200 mm (límite de plancha)' },
      { status: 400 }
    );
  }

  try {
    const pdfBytes = await generateBoxTemplate({ length, width, height });

    // Convertir Uint8Array a Buffer para NextResponse
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="plantilla-caja-${length}x${width}x${height}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error generando plantilla PDF:', error);
    return NextResponse.json(
      { error: 'Error generando plantilla' },
      { status: 500 }
    );
  }
}
