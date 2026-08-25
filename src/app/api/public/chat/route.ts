import { NextRequest, NextResponse } from 'next/server';
import { generateChatResponse } from '@/lib/whatsapp-ai';
import type { ConversationTurn } from '@/lib/whatsapp-ai';
import { responder, agenteDisponible } from '@/lib/agente';
import { CONTACTO } from '@/lib/contacto';
import {
  anotarIntercambio,
  anotarContactoSiHay,
  yaDejoContacto,
} from '@/lib/chat-web/conversaciones';

/**
 * POST /api/public/chat — el chat del sitio.
 *
 * Atiende el agente con herramientas. Si no está configurado o se cae, contesta
 * el camino viejo con Groq.
 *
 * El respaldo existe por una razón concreta: este endpoint ya estuvo caído
 * varios días sin que nadie se enterara, porque el modelo que pedía había sido
 * retirado y el "fallback" era otro modelo de la misma familia retirada. Un
 * respaldo que comparte la causa de falla con el principal no es un respaldo.
 * Estos dos no comparten proveedor.
 */
export async function POST(request: NextRequest) {
  let message = '';
  try {
    const body = await request.json();
    const { message: raw, history = [], attribution, sesion } = body as {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      attribution?: { pagePath?: string };
      /**
       * El id que genera el navegador y guarda en localStorage.
       *
       * Es lo único que permite agrupar los mensajes de una misma persona: acá
       * no hay login ni teléfono. Puede no venir —una versión vieja del widget
       * cacheada, alguien con el storage bloqueado— y en ese caso se atiende
       * igual y no se anota nada. El chat contesta primero.
       */
      sesion?: string;
    };

    if (!raw || typeof raw !== 'string') {
      return NextResponse.json({ error: 'message es requerido' }, { status: 400 });
    }
    message = raw.trim();

    const turns: ConversationTurn[] = (history || [])
      .filter(
        (h): h is ConversationTurn =>
          (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string',
      )
      .slice(-10);

    if (agenteDisponible()) {
      try {
        // Se mira ANTES de contestar: las herramientas necesitan saber si
        // esta persona ya dejó cómo ubicarla para decidir si corresponde
        // pedírselo. Sin sesión no hay conversación guardada, y entonces
        // tampoco hay a quién volver a escribirle: se pide igual.
        const r = await responder(message, turns, {
          canal: 'web',
          paginaActual: attribution?.pagePath,
          yaTenemosContacto: sesion ? await yaDejoContacto(sesion) : false,
        });
        if (r.texto) {
          // Se loguea qué herramientas usó para poder medir después si de
          // verdad está cotizando o si contesta de memoria.
          console.log(
            '[Chat] agente ok. herramientas: %s',
            r.herramientasUsadas.join(',') || 'ninguna',
          );

          // Se anota ANTES del return: en serverless, lo que se deja para
          // después de responder se corta a la mitad. Nunca tira —si la base
          // falla, la persona igual recibe su respuesta.
          if (sesion) {
            await anotarIntercambio({
              sesion,
              pregunta: message,
              respuesta: r.texto,
              pagina: attribution?.pagePath,
              herramientas: r.herramientasUsadas,
            });
            await anotarContactoSiHay(sesion, message);
          }

          return NextResponse.json({ response: r.texto });
        }
        console.error('[Chat] el agente devolvió vacío, pasando al respaldo');
      } catch (error) {
        console.error('[Chat] el agente falló, pasando al respaldo:', error);
      }
    }

    const context = attribution?.pagePath ? { landingPage: attribution.pagePath } : undefined;
    const response = await generateChatResponse(message, turns, context);

    // El camino de respaldo también se anota: una conversación atendida por
    // el respaldo es exactamente la que más conviene poder leer después.
    const texto = typeof response === 'object' && 'response' in response ? response.response : String(response);
    if (sesion) {
      await anotarIntercambio({ sesion, pregunta: message, respuesta: texto, pagina: attribution?.pagePath });
      await anotarContactoSiHay(sesion, message);
    }

    if (typeof response === 'object' && 'templateUrl' in response) {
      return NextResponse.json({ response: response.response, templateUrl: response.templateUrl });
    }
    return NextResponse.json({ response });
  } catch (error) {
    console.error('[Chat] Error:', error);
    // Una disculpa con una salida concreta. Antes devolvía 500 con un texto
    // genérico y la persona quedaba sin saber a dónde ir.
    return NextResponse.json({
      response:
        `Perdón, tuve un problema técnico. Escribinos por WhatsApp al ` +
        `${CONTACTO.telefonoVisible} y lo resolvemos a mano.`,
    });
  }
}
