// Accountability follow-up rules: which scored calls get an outcome message, and
// how a raw `signals` row becomes a FollowUpSignal. Pure (no I/O). Rows are
// treated as untrusted (a client can insert its own signals), so every field
// is validated before any of it is echoed back in a message.
import { isSupportedCoin } from '@/lib/coins';
import type { SignalOutcome } from '@/lib/signal-outcome';
import { TELEGRAM_READ_PREFIX } from './record';
import type { FollowUpSignal } from './format';
import { UUID_RE } from '@/lib/uuid';

export const FINAL_OUTCOMES: SignalOutcome[] = ['hit_target', 'hit_stop', 'expired_profit', 'expired_loss'];

/** Only calls finalized within this window are followed up (no backlog blasts). */
export const FOLLOWUP_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** At most this many follow-ups per chat per run; the rest go out next run. */
export const MAX_FOLLOWUPS_PER_CHAT_PER_RUN = 3;

export interface SignalRow {
  id: unknown;
  user_id: unknown;
  symbol: unknown;
  action: unknown;
  entry_price: unknown;
  target_price: unknown;
  stop_loss: unknown;
  outcome: unknown;
  profit_loss_percent: unknown;
  price_at_24h: unknown;
  reasoning: unknown;
  created_at: unknown;
  evaluated_at: unknown;
}


function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate a finalized Telegram signal row and map it for formatFollowUp, or
 * null when it must not be followed up (pending, not from Telegram, malformed).
 */
export function toFollowUpSignal(row: SignalRow): FollowUpSignal | null {
  if (typeof row.id !== 'string' || !UUID_RE.test(row.id)) return null;
  if (typeof row.reasoning !== 'string' || !row.reasoning.startsWith(TELEGRAM_READ_PREFIX)) return null;
  if (typeof row.outcome !== 'string' || !(FINAL_OUTCOMES as string[]).includes(row.outcome)) return null;
  if (typeof row.evaluated_at !== 'string' || typeof row.created_at !== 'string') return null;
  if (typeof row.symbol !== 'string' || !isSupportedCoin(row.symbol)) return null;
  if (row.action !== 'BUY' && row.action !== 'SELL' && row.action !== 'HOLD') return null;

  const entryPrice = num(row.entry_price);
  const targetPrice = num(row.target_price);
  const stopLoss = num(row.stop_loss);
  const profitLossPercent = num(row.profit_loss_percent);
  if (entryPrice == null || entryPrice <= 0 || targetPrice == null || stopLoss == null || profitLossPercent == null) return null;
  const priceAt24h = num(row.price_at_24h);

  return {
    id: row.id,
    symbol: row.symbol.toUpperCase(),
    action: row.action,
    entryPrice,
    targetPrice,
    stopLoss,
    outcome: row.outcome as SignalOutcome,
    profitLossPercent,
    priceAt24h: priceAt24h != null && priceAt24h > 0 ? priceAt24h : null,
    createdAt: row.created_at,
  };
}

/**
 * Pick which chat receives a user's follow-ups: the most recently active PRIVATE
 * chat linked to that account (Telegram private chat ids are positive).
 */
export function pickFollowUpChat(chats: Array<{ telegram_id: unknown; user_id: unknown; updated_at: unknown }>): Map<string, string> {
  const best = new Map<string, { chatId: string; at: number }>();
  for (const c of chats) {
    const chatId = String(c.telegram_id ?? '');
    if (!/^\d+$/.test(chatId) || typeof c.user_id !== 'string') continue;
    const at = typeof c.updated_at === 'string' ? Date.parse(c.updated_at) || 0 : 0;
    const prev = best.get(c.user_id);
    if (!prev || at > prev.at) best.set(c.user_id, { chatId, at });
  }
  return new Map(Array.from(best, ([uid, v]) => [uid, v.chatId]));
}
