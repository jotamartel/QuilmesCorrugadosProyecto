import { NextRequest, NextResponse } from 'next/server';
import { generateChatResponse } from '@/lib/whatsapp-ai';
import type { ConversationTurn } from '@/lib/whatsapp-ai';
import { responder, agenteDisponible } from '@/lib/agente';
import { CONTACTO } from '@/lib/contacto';

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
    const { message: raw, history = [], attribution } = body as {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      attribution?: { pagePath?: string };
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
        const r = await responder(message, turns, {
          canal: 'web',
          paginaActual: attribution?.pagePath,
        });
        if (r.texto) {
          // Se loguea qué herramientas usó para poder medir después si de
          // verdad está cotizando o si contesta de memoria.
          console.log(
            '[Chat] agente ok. herramientas: %s',
            r.herramientasUsadas.join(',') || 'ninguna',
          );
          return NextResponse.json({ response: r.texto });
        }
        console.error('[Chat] el agente devolvió vacío, pasando al respaldo');
      } catch (error) {
        console.error('[Chat] el agente falló, pasando al respaldo:', error);
      }
    }

    const context = attribution?.pagePath ? { landingPage: attribution.pagePath } : undefined;
    const response = await generateChatResponse(message, turns, context);

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
