/**
 * Telegram Bot API client
 * Core functions for sending messages, handling callbacks, etc.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  return token;
}

function getChatId(): string {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID no configurado');
  return chatId;
}

export function isTelegramEnabled(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

interface SendMessageOptions {
  chatId?: string;
  text: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  replyToMessageId?: number;
  inlineKeyboard?: InlineButton[][];
}

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

/**
 * Send a text message via Telegram Bot API
 */
export async function sendMessage(options: SendMessageOptions): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const token = getToken();
  const chatId = options.chatId || getChatId();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: options.text,
    parse_mode: options.parseMode || 'HTML',
  };

  if (options.replyToMessageId) {
    body.reply_to_message_id = options.replyToMessageId;
  }

  if (options.inlineKeyboard) {
    body.reply_markup = {
      inline_keyboard: options.inlineKeyboard,
    };
  }

  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return res.json();
}

/**
 * Edit an existing message
 */
export async function editMessage(chatId: string, messageId: number, text: string, inlineKeyboard?: InlineButton[][]): Promise<void> {
  const token = getToken();

  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Answer a callback query (acknowledge button tap)
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const token = getToken();

  await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || '',
    }),
  });
}

/**
 * Set the webhook URL for the bot
 */
export async function setWebhook(url: string): Promise<{ ok: boolean; description?: string }> {
  const token = getToken();

  const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      allowed_updates: ['message', 'callback_query'],
    }),
  });

  return res.json();
}

/**
 * Get current webhook info
 */
export async function getWebhookInfo(): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
  return res.json();
}
