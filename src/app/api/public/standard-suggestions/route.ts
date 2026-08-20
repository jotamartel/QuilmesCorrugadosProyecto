/**
 * API Pública: /api/public/standard-suggestions
 * GET - Devuelve las 2 cajas estándar más cercanas en tamaño a las dimensiones dadas.
 * Usado en el retail para sugerir cajas de stock cuando el pedido es < 1000 m².
 *
 * NO se filtra por stock. Antes sí: se pedía stock suficiente para cubrir el pedido
 * entero, porque el diferencial del canal era la entrega inmediata. Con el mínimo de
 * compra en m² eso dejó de funcionar — para llegar a 500 m² hacen falta entre 205 y
 * 1.961 cajas según la medida, y ninguna tiene tanto stock cargado, así que la lista
 * volvía vacía siempre. Y una lista vacía no significa "no hay opción": debajo de los
 * 1.000 m² la medida propia no se puede fabricar, así que elegir una del catálogo es
 * la ÚNICA salida. Vaciar la lista dejaba al comprador sin ninguna.
 *
 * El stock viaja igual en la respuesta: define el plazo de entrega —lo que hay sale en
 * 24/48 hs y el resto se fabrica— no si la medida se puede comprar. Entre dos medidas
 * igual de parecidas, primero la que tiene stock.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const l = parseInt(searchParams.get('l') || '0');
    const w = parseInt(searchParams.get('w') || '0');
    const h = parseInt(searchParams.get('h') || '0');

    // El parametro qty ya no filtra nada. Se sigue aceptando —los llamadores lo
    // mandan— pero el stock dejo de decidir que medida es sugerible.

    if (!l || !w || !h) {
      return NextResponse.json({ error: 'Parametros l, w, h son requeridos' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch all active standard boxes (el filtro por stock se aplica abajo)
    const { data: boxes, error } = await supabase
      .from('boxes')
      .select('id, name, length_mm, width_mm, height_mm, m2_per_box, stock')
      .eq('is_standard', true)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching standard boxes:', error);
      return NextResponse.json({ error: 'Error al obtener cajas' }, { status: 500 });
    }

    if (!boxes || boxes.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Si la medida que tipeo YA esta en el catalogo, se devuelve aparte: no hay
    // nada que sugerirle, su medida es estandar y se puede fabricar. Sin esto el
    // flujo le pedia cambiar de medida a alguien que ya habia elegido bien.
    const exacta =
      boxes.find((box) => box.length_mm === l && box.width_mm === w && box.height_mm === h) ?? null;

    const candidates = boxes.filter((box) => box !== exacta);

    // Las medidas mas parecidas. El alto se compara contra el alto: es una RSC
    // y la apertura va arriba, asi que rotarla la dejaria abierta de costado.
    // El largo y el ancho si se intercambian entre si, y por eso la base se
    // compara ordenada: sumar |largo-largo| a secas castiga a una caja igual
    // apoyada al reves.
    //
    // El campo `entra` viaja como dato, no filtra: quien pregunta sabe que va
    // adentro de la caja y puede preferir una mas chica. Nosotros damos las
    // opciones y decimos cual es mas chica.
    const basePedida = [l, w].sort((a, b) => b - a);

    const sorted = candidates
      .map((box) => {
        const baseCaja = [box.length_mm, box.width_mm].sort((a, b) => b - a);
        return {
          ...box,
          entra:
            box.height_mm >= h && baseCaja[0] >= basePedida[0] && baseCaja[1] >= basePedida[1],
          distance:
            Math.abs(box.height_mm - h) +
            Math.abs(baseCaja[0] - basePedida[0]) +
            Math.abs(baseCaja[1] - basePedida[1]),
        };
      })
      .sort((a, b) => a.distance - b.distance || (b.stock ?? 0) - (a.stock ?? 0));

    // Return top 2
    const suggestions = sorted.slice(0, 3).map(({ distance: _distance, ...box }) => box);

    return NextResponse.json({ suggestions, exacta });
  } catch (error) {
    console.error('Error in GET /api/public/standard-suggestions:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
