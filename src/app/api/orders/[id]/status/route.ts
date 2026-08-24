/**
 * API: PATCH /api/orders/[id]/status
 * Cambia el estado de una orden con validación de flujo
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ORDER_STATUS_LABELS } from '@/lib/utils/format';
import { aplicarTransicion, TransicionInvalida } from '@/lib/orders/transiciones';
import {
  notificarEventoDePedido,
  EVENTO_POR_ESTADO,
  type ResultadoAviso,
} from '@/lib/notificaciones-pedido';
import type { OrderStatus, UpdateOrderStatusRequest } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: UpdateOrderStatusRequest = await request.json();
    const supabase = createAdminClient();

    // Validar que se proporciona el nuevo estado
    if (!body.status) {
      return NextResponse.json(
        { error: 'El nuevo estado es requerido' },
        { status: 400 }
      );
    }

    const newStatus = body.status;

    // TODO EL MOVIMIENTO LO HACE UN SOLO LUGAR.
    //
    // Antes acá había una copia del grafo de transiciones, las reglas, el
    // switch de timestamps y el insert al historial — y otra copia del grafo
    // en format.ts, y /dispatch escribiendo el estado a mano sin mirar
    // ninguna. Ahora esto es un handler HTTP: traduce el pedido, llama al
    // motor y traduce la respuesta.
    let orden;
    let anterior;
    try {
      const r = await aplicarTransicion(supabase, id, newStatus, {
        fuente: 'panel',
        notas: body.notes,
      });
      orden = r.orden;
      anterior = r.anterior;
    } catch (e) {
      if (e instanceof TransicionInvalida) {
        return NextResponse.json({ error: e.message }, { status: e.http });
      }
      throw e;
    }

    // EL AVISO AL CLIENTE.
    //
    // Va DESPUÉS del update: si el aviso falla, el pedido ya avanzó igual y lo
    // único pendiente es contarlo. Al revés —avisar antes de mover— se le
    // podría decir al cliente que empezamos a fabricar y que el cambio no
    // quede guardado.
    //
    // Prendido por default, apagado si el operador destildó el casillero: la
    // promesa fue "le notificás todos los movimientos", así que el silencio
    // tiene que ser una decisión, no el comportamiento por omisión.
    const evento = EVENTO_POR_ESTADO[newStatus];
    let aviso: ResultadoAviso | null = null;
    if (evento && body.notificar !== false) {
      aviso = await notificarEventoDePedido({
        orderId: id,
        evento,
        actor: body.actor,
      });
    }

    return NextResponse.json({
      success: true,
      order: orden,
      aviso,
      message: `Orden ${orden.order_number} actualizada a "${ORDER_STATUS_LABELS[newStatus]}"`,
    });
  } catch (error) {
    console.error('Error in PATCH /api/orders/[id]/status:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el estado de la orden' },
      { status: 500 }
    );
  }
}
