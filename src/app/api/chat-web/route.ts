/**
 * GET /api/chat-web — las conversaciones del chat del sitio.
 *
 * Aparte de /api/whatsapp/conversations a propósito: acá no se puede
 * contestar. Este endpoint es de lectura y nada más, y eso es lo que la
 * pantalla tiene que dejar claro.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const db = createAdminClient();
    const { searchParams } = new URL(request.url);
    const sesion = searchParams.get('sesion');

    // El detalle de una conversación: sus mensajes, en orden.
    if (sesion) {
      const { data: conv } = await db
        .from('chat_web_conversaciones')
        .select('*')
        .eq('sesion', sesion)
        .maybeSingle();

      if (!conv) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

      const { data: mensajes } = await db
        .from('chat_web_mensajes')
        .select('id, rol, contenido, pagina, creado_en')
        .eq('conversacion_id', conv.id)
        .order('creado_en', { ascending: true });

      return NextResponse.json({ conversacion: conv, mensajes: mensajes ?? [] });
    }

    // La lista. Las que necesitan atención primero: una consulta que el
    // asistente no supo contestar envejece mal.
    const { data, error } = await db
      .from('chat_web_conversaciones')
      .select('*')
      .order('ultima_en', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[chat-web] no se pudo leer la lista:', error.message);
      return NextResponse.json({ error: 'Error al leer las conversaciones' }, { status: 500 });
    }

    const conversaciones = data ?? [];
    return NextResponse.json({
      data: conversaciones,
      resumen: {
        total: conversaciones.length,
        sin_respuesta: conversaciones.filter((c) => c.hubo_pregunta_sin_respuesta).length,
        pidieron_humano: conversaciones.filter((c) => c.pidio_humano).length,
        con_contacto: conversaciones.filter((c) => c.contacto).length,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/chat-web:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
