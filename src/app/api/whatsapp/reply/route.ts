/**
 * Responder una conversación de WhatsApp desde el panel.
 *
 * POR QUÉ EXISTE
 *
 * Hasta ahora el único lugar del sistema que mandaba un WhatsApp era el
 * webhook, o sea que solo se podía contestar automáticamente y solo en reacción
 * a un mensaje entrante. Cuando el asistente derivaba a una persona, esa persona
 * tenía que abrir WhatsApp en su celular: el cliente pasaba a otra conversación,
 * con otro número, y lo que se hablaba ahí no quedaba registrado en ningún lado.
 * En el panel se veía media conversación.
 *
 * QUÉ HACE ADEMÁS DE ENVIAR
 *
 * Contestar es tomar la conversación. Así que además de mandar el mensaje,
 * PAUSA al asistente: si no, el bot le sigue hablando por encima al vendedor,
 * que es exactamente lo que pasaba antes. La pausa vence sola —ver el comentario
 * de pausarAsistente— para que una conversación no quede muda para siempre
 * porque alguien se olvidó de devolverla.
 *
 * LA VENTANA DE 24 HORAS
 *
 * WhatsApp solo permite escribir texto libre dentro de las 24 horas del último
 * mensaje del cliente. Fuera de eso hace falta una plantilla aprobada por Meta,
 * que todavía no tenemos. Por eso se chequea antes y se devuelve un error
 * explicando el motivo, en vez de dejar que Twilio falle con un código que no
 * le dice nada a quien está atendiendo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendWhatsAppMessage,
  pausarAsistente,
  reanudarAsistente,
  PAUSA_POR_RESPUESTA_HUMANA_MS,
} from '@/lib/whatsapp';

/** WhatsApp no deja escribir texto libre pasado este tiempo sin respuesta del cliente. */
const VENTANA_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    // El panel es privado: acá sí hay sesión, a diferencia del webhook.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const telefono: string = (body.phoneNumber || '').trim();
    const mensaje: string = (body.message || '').trim();

    if (!telefono || !mensaje) {
      return NextResponse.json(
        { error: 'Faltan el teléfono y el mensaje.' },
        { status: 400 },
      );
    }
    if (mensaje.length > 4000) {
      return NextResponse.json(
        { error: 'El mensaje es demasiado largo para WhatsApp.' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // ¿Estamos dentro de la ventana? Se mide contra el último mensaje que mandó
    // el CLIENTE, no contra el último de la conversación: contestar nosotros no
    // reabre la ventana.
    const { data: ultimoEntrante } = await admin
      .from('communications')
      .select('created_at')
      .eq('channel', 'whatsapp')
      .eq('direction', 'inbound')
      .eq('metadata->>phone', telefono)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimoEntrante) {
      return NextResponse.json(
        {
          error:
            'Esta persona nunca escribió, así que no se le puede mandar un mensaje ' +
            'libre. Hace falta una plantilla aprobada por Meta.',
        },
        { status: 409 },
      );
    }

    const desde = Date.now() - new Date(ultimoEntrante.created_at).getTime();
    if (desde > VENTANA_MS) {
      const horas = Math.floor(desde / (60 * 60 * 1000));
      return NextResponse.json(
        {
          error:
            `El último mensaje del cliente fue hace ${horas} horas y WhatsApp solo ` +
            `permite escribir libremente dentro de las 24. Para reabrir la ` +
            `conversación hace falta una plantilla aprobada por Meta.`,
          fueraDeVentana: true,
        },
        { status: 409 },
      );
    }

    // La pausa se escribe ANTES de enviar, no despues.
    //
    // Entre que Twilio acepta el mensaje y que se escribe la pausa hay unos
    // cientos de milisegundos. Un cliente impaciente que manda otro mensaje
    // justo ahi hace que el webhook lea la pausa todavia en null y el asistente
    // conteste por encima de la persona. Escribiendo primero, esa ventana no
    // existe: cuando el mensaje sale, la conversacion ya esta tomada.
    //
    // Si el envio despues falla, queda una pausa puesta sin mensaje enviado. Es
    // el error barato de los dos: el asistente se calla un rato de mas en una
    // conversacion que alguien estaba por atender, y hay un boton para
    // devolversela. Al reves, el bot habla encima de un vendedor.
    const quien = user.email || user.id;
    const pausadoHasta = await pausarAsistente(
      telefono,
      PAUSA_POR_RESPUESTA_HUMANA_MS,
      quien,
    );

    const enviado = await sendWhatsAppMessage({ to: telefono, body: mensaje });
    if (!enviado) {
      return NextResponse.json(
        {
          error:
            'No se pudo enviar el mensaje. Revisá la configuración de WhatsApp. ' +
            'El asistente quedó pausado en esta conversación: si no vas a atenderla, ' +
            'devolvésela con el botón.',
        },
        { status: 502 },
      );
    }

    // Queda registrado como saliente humano, no del asistente: es lo que
    // distingue en el panel quién dijo qué.
    await admin.from('communications').insert({
      channel: 'whatsapp',
      direction: 'outbound',
      content: mensaje,
      metadata: { phone: telefono, humano: true, usuario: quien },
    });

    return NextResponse.json({
      ok: true,
      pausadoHasta: pausadoHasta?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[WhatsApp] Error respondiendo desde el panel:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/** Devolverle la conversación al asistente antes de que venza la pausa. */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const telefono = (searchParams.get('phoneNumber') || '').trim();
    if (!telefono) {
      return NextResponse.json({ error: 'Falta el teléfono.' }, { status: 400 });
    }

    const ok = await reanudarAsistente(telefono);
    return NextResponse.json({ ok });
  } catch (error) {
    console.error('[WhatsApp] Error reanudando el asistente:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
