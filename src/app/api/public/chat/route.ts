import { NextRequest, NextResponse } from 'next/server';
import { generateChatResponse } from '@/lib/whatsapp-ai';
import type { ConversationTurn } from '@/lib/whatsapp-ai';

/**
 * POST /api/public/chat
 * Chatbot web - misma IA que WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], attribution } = body as {
      message: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      attribution?: { pagePath?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message es requerido' },
        { status: 400 }
      );
    }

    const turns: ConversationTurn[] = (history || [])
      .filter(
        (h): h is ConversationTurn =>
          (h.role === 'user' || h.role === 'assistant') &&
          typeof h.content === 'string'
      )
      .slice(-10);

    const context = attribution?.pagePath ? { landingPage: attribution.pagePath } : undefined;

    const response = await generateChatResponse(message.trim(), turns, context);

    if (typeof response === 'object' && 'templateUrl' in response) {
      return NextResponse.json({
        response: response.response,
        templateUrl: response.templateUrl,
      });
    }
    return NextResponse.json({ response });
  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json(
      { error: 'Error procesando el mensaje' },
      { status: 500 }
    );
  }
}
