/**
 * Telegram Webhook Handler
 * Receives updates from Telegram Bot API
 *
 * Handles:
 * - Callback queries (inline button taps)
 * - Text messages (AI conversation for refining sales messages)
 * - /start command
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, answerCallbackQuery, editMessage } from '@/lib/telegram/bot';
import { getQuoteData, generateSalesMessage, refineSalesMessage } from '@/lib/telegram/ai-sales';

// In-memory cache for active conversations (quote being worked on per chat)
// In serverless, this resets between invocations — but callback_data carries quoteId
const activeConversations = new Map<string, {
  quoteId: string;
  lastMessage: string;
  messageId: number;
}>();

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    reply_to_message?: {
      message_id: number;
      text?: string;
    };
  };
  callback_query?: {
    id: string;
    chat_instance: string;
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
    data?: string;
  };
}

/**
 * Telegram manda esta cabecera con el valor que se le pasa como `secret_token`
 * al registrar el webhook. Es el mecanismo que ofrece la API para saber que la
 * llamada viene de ellos.
 */
const CABECERA_SECRETO = 'x-telegram-bot-api-secret-token';

export async function POST(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────────────────────────────
    // Que la llamada venga de Telegram.
    //
    // No se comprobaba nada, y la lista blanca de src/proxy.ts decia "webhook:
    // valida secret token", que era falso. Sin esto, cualquiera con la URL puede
    // mandar un `update` armado a mano: el bot le contesta a cualquier chat que
    // le pongan, y de paso dispara las llamadas al modelo de handleTextMessage,
    // que se facturan.
    //
    // Sin el secreto configurado NO bloquea, igual que en Meta, Resend y
    // MercadoPago: un despliegue al que se le olvido una variable no deberia
    // dejar sordo al bot. Pero queda dicho en el log.
    //
    // Para activarlo hay que registrar el webhook pasando secret_token:
    //   https://api.telegram.org/bot<TOKEN>/setWebhook
    //     ?url=<URL>&secret_token=<TELEGRAM_WEBHOOK_SECRET>
    // ─────────────────────────────────────────────────────────────────────
    const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secreto) {
      console.error(
        '[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET no configurada: se estan ' +
          'aceptando updates sin comprobar que vengan de Telegram',
      );
    } else if (request.headers.get(CABECERA_SECRETO) !== secreto) {
      console.error('[Telegram Webhook] secret token invalido, se rechaza');
      // 401 y no 200: acá sí conviene que Telegram lo note, porque si el que
      // llama es Telegram de verdad significa que el secreto quedó mal.
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const update: TelegramUpdate = await request.json();

    // Handle callback queries (button taps)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    // Handle text messages
    if (update.message?.text) {
      await handleTextMessage(update.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    return NextResponse.json({ ok: true }); // Always 200 to avoid Telegram retries
  }
}

/**
 * Handle inline button taps
 */
async function handleCallbackQuery(query: {
  id: string;
  message?: { message_id: number; chat: { id: number }; text?: string };
  data?: string;
}) {
  const chatId = query.message?.chat.id?.toString();
  if (!chatId || !query.data) {
    await answerCallbackQuery(query.id);
    return;
  }

  // Parse callback data
  const [action, quoteId] = query.data.split(':');

  if (action === 'gen_msg' && quoteId) {
    await answerCallbackQuery(query.id, '✍️ Generando mensaje...');

    // Fetch quote data
    const quote = await getQuoteData(quoteId);
    if (!quote) {
      await sendMessage({
        chatId,
        text: '❌ No se encontro la cotizacion.',
      });
      return;
    }

    // Generate sales message
    const salesMsg = await generateSalesMessage(quote);

    // Clean phone for WhatsApp link
    const cleanPhone = quote.requester_phone.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;
    const waLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(salesMsg)}`;

    // Store active conversation
    activeConversations.set(chatId, {
      quoteId,
      lastMessage: salesMsg,
      messageId: query.message?.message_id || 0,
    });

    const response = await sendMessage({
      chatId,
      text: `<b>✍️ Mensaje generado para ${quote.requester_name}:</b>\n\n<i>${escapeHtml(salesMsg)}</i>\n\n💡 <b>Responde a este mensaje</b> para ajustarlo (ej: "mas formal", "ofrece descuento del 10%", "preguntale cuando necesita las cajas")`,
      parseMode: 'HTML',
      inlineKeyboard: [
        [
          { text: '📲 Enviar por WhatsApp', url: waLink },
        ],
        [
          { text: '🔄 Regenerar', callback_data: `regen:${quoteId}` },
          { text: '📋 Copiar', callback_data: `copy:${quoteId}` },
        ],
      ],
    });

    // Update stored message ID
    if (response.ok && response.result) {
      activeConversations.set(chatId, {
        quoteId,
        lastMessage: salesMsg,
        messageId: response.result.message_id,
      });
    }
    return;
  }

  if (action === 'regen' && quoteId) {
    await answerCallbackQuery(query.id, '🔄 Regenerando...');

    const quote = await getQuoteData(quoteId);
    if (!quote) {
      await sendMessage({ chatId, text: '❌ No se encontro la cotizacion.' });
      return;
    }

    const salesMsg = await generateSalesMessage(quote);

    const cleanPhone = quote.requester_phone.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;
    const waLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(salesMsg)}`;

    activeConversations.set(chatId, {
      quoteId,
      lastMessage: salesMsg,
      messageId: query.message?.message_id || 0,
    });

    // Edit the existing message with new content
    if (query.message?.message_id) {
      await editMessage(
        chatId,
        query.message.message_id,
        `<b>✍️ Mensaje generado para ${quote.requester_name}:</b>\n\n<i>${escapeHtml(salesMsg)}</i>\n\n💡 <b>Responde a este mensaje</b> para ajustarlo`,
        [
          [{ text: '📲 Enviar por WhatsApp', url: waLink }],
          [
            { text: '🔄 Regenerar', callback_data: `regen:${quoteId}` },
            { text: '📋 Copiar', callback_data: `copy:${quoteId}` },
          ],
        ],
      );
    }
    return;
  }

  if (action === 'copy' && quoteId) {
    const conv = activeConversations.get(chatId);
    if (conv?.lastMessage) {
      await sendMessage({
        chatId,
        text: conv.lastMessage,
        parseMode: 'HTML',
      });
      await answerCallbackQuery(query.id, '📋 Mensaje copiado arriba');
    } else {
      await answerCallbackQuery(query.id, '❌ No hay mensaje para copiar');
    }
    return;
  }

  await answerCallbackQuery(query.id);
}

/**
 * Handle text messages (including replies for message refinement)
 */
async function handleTextMessage(message: {
  message_id: number;
  chat: { id: number };
  text?: string;
  reply_to_message?: { message_id: number; text?: string };
}) {
  const chatId = message.chat.id.toString();
  const text = message.text?.trim() || '';

  // /start command
  if (text === '/start') {
    await sendMessage({
      chatId,
      text: `<b>👋 Hola! Soy el bot de Quilmes Corrugados.</b>\n\nTe voy a notificar cada vez que llegue un nuevo pedido retail.\n\nPodes:\n• Tocar <b>"Generar mensaje"</b> en cada notificacion\n• <b>Responder</b> al mensaje generado para ajustarlo\n• Tocar <b>"Enviar por WhatsApp"</b> cuando estes conforme\n\n📊 Tu Chat ID: <code>${chatId}</code>`,
      parseMode: 'HTML',
    });
    return;
  }

  // /id command — useful for setup
  if (text === '/id') {
    await sendMessage({
      chatId,
      text: `Tu Chat ID es: <code>${chatId}</code>`,
      parseMode: 'HTML',
    });
    return;
  }

  // Check if this is a reply to a generated message (for refinement)
  if (message.reply_to_message) {
    // Try to find the active conversation for this chat
    const conv = activeConversations.get(chatId);

    // Also try to extract quoteId from the replied-to message text
    const quoteId = conv?.quoteId;
    const lastMessage = conv?.lastMessage;

    if (!quoteId) {
      // Try to find quote ID from callback buttons in the original message
      // Since we can't access inline keyboard from reply, try to find it from recent conversations
      await sendMessage({
        chatId,
        text: '💡 Para ajustar un mensaje, primero toca <b>"Generar mensaje"</b> en la notificacion del pedido, y luego responde al mensaje generado.',
        parseMode: 'HTML',
      });
      return;
    }

    // Fetch quote and refine the message
    const quote = await getQuoteData(quoteId);
    if (!quote) {
      await sendMessage({ chatId, text: '❌ No se encontro la cotizacion.' });
      return;
    }

    const refinedMsg = await refineSalesMessage(lastMessage || '', quote, text);

    const cleanPhone = quote.requester_phone.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.startsWith('54') ? cleanPhone : `54${cleanPhone}`;
    const waLink = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(refinedMsg)}`;

    // Update conversation
    activeConversations.set(chatId, {
      quoteId,
      lastMessage: refinedMsg,
      messageId: message.message_id,
    });

    await sendMessage({
      chatId,
      text: `<b>✍️ Mensaje ajustado:</b>\n\n<i>${escapeHtml(refinedMsg)}</i>\n\n💡 Responde de nuevo para seguir ajustando.`,
      parseMode: 'HTML',
      replyToMessageId: message.message_id,
      inlineKeyboard: [
        [{ text: '📲 Enviar por WhatsApp', url: waLink }],
        [
          { text: '🔄 Regenerar desde cero', callback_data: `gen_msg:${quoteId}` },
          { text: '📋 Copiar', callback_data: `copy:${quoteId}` },
        ],
      ],
    });
    return;
  }

  // Generic message — no active context
  await sendMessage({
    chatId,
    text: '💡 Cuando llegue un nuevo pedido, te notifico aca. Toca <b>"Generar mensaje"</b> para que te arme un mensaje de venta personalizado.',
    parseMode: 'HTML',
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// GET endpoint to check webhook status and set it up
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'setup') {
    // Auto-detect the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || `https://${request.headers.get('host')}`;
    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    const { setWebhook } = await import('@/lib/telegram/bot');
    const result = await setWebhook(webhookUrl);

    return NextResponse.json({
      webhook_url: webhookUrl,
      result,
    });
  }

  if (action === 'info') {
    const { getWebhookInfo } = await import('@/lib/telegram/bot');
    const info = await getWebhookInfo();
    return NextResponse.json(info);
  }

  return NextResponse.json({
    status: 'ok',
    hint: 'Use ?action=setup to configure webhook, ?action=info to check status',
  });
}
