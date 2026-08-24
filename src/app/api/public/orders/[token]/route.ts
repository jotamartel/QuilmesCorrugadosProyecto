/**
 * GET /api/public/orders/[token] — el estado de un pedido, para su cliente.
 *
 * La llave es el public_token (migracion 031), NUNCA el UUID de la orden: el
 * UUID viaja por caminos internos (panel, logs, mails del equipo) y no debe
 * tener una segunda vida como puerta publica.
 *
 * QUE DEVUELVE — el SELECT es una lista blanca, campo por campo. El link va a
 * quedar en historiales de chat, capturas y reenvios: todo lo que responda
 * esta expuesto a cualquiera que tenga el link, no solo al cliente original.
 * Los hitos y las medidas el cliente ya los sabe. Lo que NO va: datos de
 * contacto, direcciones, montos (municion para "te falta pagar X, transferi
 * aca"), campos de facturacion, ni el UUID interno. Cada campo que se quiera
 * agregar se decide explicito.
 *
 * Cae en la lista PUBLICO de src/proxy.ts por el prefijo /api/public/.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { esTokenPedidoValido } from '@/lib/orders/token-publico';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  // Un token que no tiene la forma no toca la base: 404 directo. Cubre el
  // UUID interno, basura y cualquier intento de path raro.
  if (!esTokenPedidoValido(token)) {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from('orders')
    .select(
      `
      order_number,
      status,
      created_at,
      confirmed_at,
      production_started_at,
      ready_at,
      shipped_at,
      delivered_at,
      cancelled_at,
      estimated_delivery,
      quantities_confirmed,
      items:order_items(length_mm, width_mm, height_mm, quantity, quantity_delivered)
    `,
    )
    .eq('public_token', token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  }

  return NextResponse.json(data);
}
