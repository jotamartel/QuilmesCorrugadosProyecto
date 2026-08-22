/**
 * Las preguntas que el asistente no supo contestar, y sus respuestas.
 *
 * GET    lista pendientes y respondidas
 * POST   guarda la respuesta reutilizable de una pregunta
 * DELETE la saca de la lista sin responderla
 *
 * Todo pide sesión: acá se escribe lo que el asistente le va a decir a los
 * clientes de acá en adelante, así que no es un endpoint público ni con service
 * role. Si esto se pudiera escribir sin autenticar, cualquiera podría hacerle
 * decir cualquier cosa al asistente en el canal de ventas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  preguntasPendientes,
  respuestasDelEquipo,
  responderPregunta,
  descartarPregunta,
} from '@/lib/conocimiento';

async function usuario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  try {
    if (!(await usuario())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const [pendientes, respondidas] = await Promise.all([
      preguntasPendientes(),
      respuestasDelEquipo(),
    ]);
    return NextResponse.json({ pendientes, respondidas });
  } catch (error) {
    console.error('[conocimiento] error listando:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await usuario();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id: string = (body.id || '').trim();
    const respuesta: string = (body.respuesta || '').trim();

    if (!id || !respuesta) {
      return NextResponse.json(
        { error: 'Faltan la pregunta y la respuesta.' },
        { status: 400 },
      );
    }

    // El límite no es por la base sino por quien la lee: esta respuesta se la
    // va a leer el asistente a alguien por WhatsApp. Cuatro párrafos no se
    // leen en un teléfono.
    if (respuesta.length > 1500) {
      return NextResponse.json(
        { error: 'La respuesta es muy larga. Escribila en pocas líneas: se la va a leer a un cliente por WhatsApp.' },
        { status: 400 },
      );
    }

    const ok = await responderPregunta(id, respuesta, user.email || user.id);
    if (!ok) {
      return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[conocimiento] error guardando:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await usuario();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const id = (new URL(request.url).searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 });
    }

    const ok = await descartarPregunta(id, user.email || user.id);
    return NextResponse.json({ ok });
  } catch (error) {
    console.error('[conocimiento] error descartando:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
