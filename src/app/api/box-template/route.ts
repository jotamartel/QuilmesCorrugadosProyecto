import { NextRequest, NextResponse } from 'next/server';
import { generateBoxTemplate } from '@/lib/box-template-generator';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const length = parseInt(searchParams.get('length') || '400');
  const width = parseInt(searchParams.get('width') || '300');
  const height = parseInt(searchParams.get('height') || '300');

  // Validar dimensiones
  if (length < 200 || length > 800 ||
      width < 200 || width > 600 ||
      height < 100 || height > 600) {
    return NextResponse.json(
      { error: 'Dimensiones fuera de rango permitido' },
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
