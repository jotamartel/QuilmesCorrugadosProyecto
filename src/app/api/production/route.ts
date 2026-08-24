/**
 * GET /api/production — lo que hay que fabricar, ordenado por urgencia.
 *
 * /ordenes es la gestión del pedido: pagos, despacho, documentos, historial.
 * Esto es otra pregunta, la que se hace alguien parado en la planta a las
 * siete de la mañana: qué sale hoy y en qué orden. Mezclarlas hace peor a las
 * dos, así que va por su lado.
 *
 * LA MEDIDA DE PLANCHA SE CALCULA, NO SE GUARDA
 *
 * order_items tiene la medida de la caja cerrada; la plancha sale de una
 * fórmula determinista sobre esas tres medidas. Duplicarla en la tabla sería
 * mantener dos verdades para el mismo dato — y el día que cambie el chapetón,
 * una quedaría vieja sin que nadie se entere. Se calcula acá con la misma
 * función que usa el motor de cotización.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateUnfolded } from '@/lib/utils/box-calculations';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import type { OrderStatus } from '@/lib/types/database';

/** Los estados que están en la cola de fabricación. */
const EN_FABRICA: OrderStatus[] = ['confirmed', 'in_production', 'ready'];

interface ItemDeProduccion {
  id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  m2_per_box: number;
  total_m2: number;
}

export async function GET(request: NextRequest) {
  try {
    const db = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Lo que todavía no arrancó pero ya se cobró: se puede pedir aparte
    // porque para planificar la semana sirve verlo, y para el día de hoy es
    // ruido.
    const estados = searchParams.get('incluir_pendientes')
      ? [...EN_FABRICA, 'pending_deposit']
      : EN_FABRICA;

    const { data, error } = await db
      .from('orders')
      .select(
        `id, order_number, status, channel, estimated_delivery, scheduled_delivery_date,
         delivery_time_window, total_m2, quantities_confirmed,
         client:clients(id, name, company),
         quote:quotes(has_printing, printing_colors),
         items:order_items(id, length_mm, width_mm, height_mm, quantity, m2_per_box, total_m2)`,
      )
      .in('status', estados)
      // Sin fecha al final: no es que no urja, es que nadie la fijó, y esas
      // van marcadas aparte para que se resuelvan.
      .order('estimated_delivery', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[produccion] no se pudo leer la cola:', error.message);
      return NextResponse.json({ error: 'Error al leer la cola de producción' }, { status: 500 });
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const ordenes = (data ?? []).map((o) => {
      const items = ((o.items ?? []) as ItemDeProduccion[]).map((i) => {
        const u = calculateUnfolded(i.length_mm, i.width_mm, i.height_mm);
        return {
          ...i,
          plancha_ancho_mm: u.unfoldedWidth,
          plancha_largo_mm: u.unfoldedLength,
          // Si esto es true, la máquina no lo hace: el ancho de plancha pasó
          // el del rollo. No debería llegar acá —el motor lo rechaza al
          // cotizar— pero un pedido cargado a mano con precio negociado sí
          // puede, y es mejor que lo vea el operador antes que la máquina.
          no_entra_en_el_rollo: u.unfoldedWidth > RETAIL_CONFIG.MAX_SHEET_WIDTH,
        };
      });

      const dias = o.estimated_delivery
        ? Math.round(
            (new Date(`${o.estimated_delivery}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000,
          )
        : null;

      return {
        ...o,
        items,
        dias_restantes: dias,
        urgencia:
          dias === null ? 'sin_fecha'
          : dias < 0 ? 'vencida'
          : dias === 0 ? 'hoy'
          : dias <= 3 ? 'proxima'
          : 'normal',
        // Para agrupar por bobina: las que comparten ancho de plancha
        // conviene fabricarlas juntas.
        plancha_ancho_max_mm: items.reduce((m, i) => Math.max(m, i.plancha_ancho_mm), 0),
        lleva_impresion:
          !!(o.quote as { has_printing?: boolean } | null)?.has_printing,
      };
    });

    return NextResponse.json({
      data: ordenes,
      resumen: {
        total: ordenes.length,
        vencidas: ordenes.filter((o) => o.urgencia === 'vencida').length,
        sin_fecha: ordenes.filter((o) => o.urgencia === 'sin_fecha').length,
        m2_total: Math.round(ordenes.reduce((s, o) => s + Number(o.total_m2 || 0), 0) * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/production:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
