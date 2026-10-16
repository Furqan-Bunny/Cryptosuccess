// Telegram side of the channel-agnostic bot: parse a (secret-verified) webhook
// update into an IncomingMessage, and deliver replies via the Bot API.
import { sendMessage } from '@/lib/telegram/api';
import type { ChannelAdapter, IncomingMessage } from '@/services/bot/types';

export const telegramAdapter: ChannelAdapter = {
  channel: 'telegram',
  send: (chatId, text) => sendMessage(chatId, text),
};

/**
 * Extract the message we act on from a Telegram update, or null to ignore it
 * (no text, edited/channel posts, messages from other bots, malformed ids).
 */
export function parseTelegramUpdate(update: unknown): IncomingMessage | null {
  const message = (update as any)?.message;
  if (!message || typeof message !== 'object') return null;

  const chatIdRaw = message.chat?.id;
  if (typeof chatIdRaw !== 'number' || !Number.isSafeInteger(chatIdRaw) || chatIdRaw === 0) return null;
  if (message.from?.is_bot === true) return null;

  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text) return null;

  const chatType = message.chat?.type;
  const username = typeof message.from?.username === 'string' ? message.from.username : null;

  return {
    channel: 'telegram',
    chatId: String(chatIdRaw),
    chatKind: chatType === 'private' ? 'private' : 'group',
    text,
    username,
  };
}
