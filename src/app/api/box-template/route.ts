import { NextRequest, NextResponse } from 'next/server';
import { generateBoxTemplate } from '@/lib/box-template-generator';
import { porQueNoSeFabrica } from '@/lib/cotizacion/motor';
import { LARGO_MAXIMO_PLANCHA } from '@/lib/utils/box-calculations';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const length = parseInt(searchParams.get('length') || '400');
  const width = parseInt(searchParams.get('width') || '300');
  const height = parseInt(searchParams.get('height') || '300');

  // Los limites salen del motor, no escritos aca.
  //
  // Estaban en duro —200x200x100 y 1200— y hoy coincidian con las constantes,
  // que es como empieza siempre: coinciden hasta que uno de los dos cambia. En
  // este repo eso ya paso con los colores de impresion (13 paginas decian 3 y la
  // API validaba 4) y con la medida minima (200x200x100 en un lado, 100x100x50
  // en otro). Esta plantilla se la lleva el cliente al disenador, asi que una
  // medida que la fabrica no hace termina en un arte que no se puede imprimir.
  const noSeFabrica = porQueNoSeFabrica({
    length_mm: length,
    width_mm: width,
    height_mm: height,
    quantity: 1,
  });
  if (noSeFabrica.length > 0) {
    return NextResponse.json(
      { error: `Esa caja no se puede fabricar: ${noSeFabrica.join('; y ')}.` },
      { status: 400 }
    );
  }

  // Una caja que se fabrica en dos mitades TAMBIÉN tiene plantilla. Acá hubo
  // un 400 ("no hay plantilla automática") que dejaba al cliente sin nada que
  // llevarle al diseñador. Pedido de Julián (27-08-2026): el desplegado se
  // dibuja igual, de una pieza, como REFERENCIA para ubicar el diseño — el PDF
  // lo aclara con una nota — y el despiece real en dos mitades lo prepara la
  // fábrica con la orden. Cómo se pega es proceso interno.
  const dosMitades = 2 * (length + width) + 50 > LARGO_MAXIMO_PLANCHA;

  try {
    const pdfBytes = await generateBoxTemplate({ length, width, height, dosMitades });

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
