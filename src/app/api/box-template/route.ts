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

  // El generador dibuja el desarrollo de UNA pieza. Una caja fabricable en
  // dos mitades pasa el chequeo de arriba, pero su plancha de una pieza no
  // existe: el PDF saldría con una plancha más larga que el rollo y sin la
  // segunda solapa, y ese dibujo va derecho al diseñador.
  if (2 * (length + width) + 50 > LARGO_MAXIMO_PLANCHA) {
    return NextResponse.json(
      {
        error:
          `La caja de ${length}x${width}x${height} mm se fabrica en dos mitades pegadas ` +
          `(su desarrollo supera el largo máximo de plancha de ${LARGO_MAXIMO_PLANCHA} mm), ` +
          'así que no tiene plantilla automática: el desplegado técnico lo prepara la ' +
          'fábrica junto con la orden.',
        fabricacion: 'dos_mitades',
      },
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
