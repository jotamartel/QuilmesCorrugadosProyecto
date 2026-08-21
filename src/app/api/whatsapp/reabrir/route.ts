/**
 * Reabrir una conversación de WhatsApp que se pasó de las 24 horas.
 *
 * POR QUÉ ES UN ENDPOINT APARTE Y NO UN FLAG DE /reply
 *
 * Se parecen —los dos le mandan algo al cliente desde el panel— pero no son lo
 * mismo. /reply manda lo que el vendedor escribió y solo funciona dentro de la
 * ventana. Esto manda un texto fijo que ya aprobó Meta, funciona justamente
 * cuando la ventana está cerrada, y no lleva la respuesta adentro: golpea la
 * puerta para que el cliente conteste y ahí sí se pueda hablar.
 *
 * Meterlo como un flag de /reply obligaba a que ese handler chequeara la
 * ventana para una cosa y la ignorara para la otra, con la mitad del código
 * detrás de un if. Separados, cada uno hace algo que se explica en una línea.
 *
 * OJO: mandar la plantilla NO abre la ventana. La abre la respuesta del
 * cliente. Hasta que conteste, el vendedor sigue sin poder escribirle libre, y
 * el panel tiene que decirlo así.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  enviarPlantillaWhatsApp,
  pausarAsistente,
  PAUSA_POR_RESPUESTA_HUMANA_MS,
} from '@/lib/whatsapp';
import { RETOMAR_CONVERSACION } from '@/lib/whatsapp-plantillas';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const telefono: string = (body.phoneNumber || '').trim();
    if (!telefono) {
      return NextResponse.json({ error: 'Falta el teléfono.' }, { status: 400 });
    }

    const quien = user.email || user.id;

    // Igual que al responder: quien reabre está tomando la conversación, así
    // que el asistente se calla. Y se escribe ANTES de mandar nada, porque el
    // cliente puede contestar en el mismo segundo y el webhook tiene que
    // encontrar la pausa ya puesta.
    await pausarAsistente(telefono, PAUSA_POR_RESPUESTA_HUMANA_MS, quien);

    const resultado = await enviarPlantillaWhatsApp(telefono, RETOMAR_CONVERSACION);

    if (resultado === 'sin_soporte') {
      return NextResponse.json(
        {
          error:
            'El proveedor de WhatsApp configurado no manda plantillas, así que no ' +
            'se puede reabrir la conversación desde acá. Hay que escribirle desde ' +
            'el celular.',
        },
        { status: 501 },
      );
    }

    if (resultado === 'error') {
      return NextResponse.json(
        {
          error:
            `No se pudo mandar la plantilla "${RETOMAR_CONVERSACION.nombre}". ` +
            'Suele ser que todavía no está aprobada en Meta, o que el idioma con ' +
            'que está cargada no coincide. El asistente quedó pausado: si no vas a ' +
            'atender esta conversación, devolvésela con el botón.',
        },
        { status: 502 },
      );
    }

    // Queda en el historial como saliente humano: si no, en el panel aparece un
    // hueco de tiempo sin explicación entre la consulta del cliente y su
    // respuesta de dos días después.
    const admin = createAdminClient();
    await admin.from('communications').insert({
      channel: 'whatsapp',
      direction: 'outbound',
      content: RETOMAR_CONVERSACION.cuerpo,
      metadata: {
        phone: telefono,
        humano: true,
        usuario: quien,
        plantilla: RETOMAR_CONVERSACION.nombre,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[WhatsApp] Error reabriendo la conversación:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
