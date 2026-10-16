// Supabase-backed BotStore for Telegram chats (telegram_users / telegram_prefs
// + the SECURITY DEFINER RPCs from migrations 0007, 0008 and 0010). Uses the
// service-role client, so it must only ever run on the server. Identity is the
// chat id Telegram delivered on a secret-verified webhook — never a user id from
// the message.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalystTake } from '@/services/analyst.service';
import { fetchSpotPrice } from '@/lib/server/binance-server';
import { buildSignalRecord } from '@/services/bot/record';
import { prefsFromRow } from '@/services/bot/prefs';
import type { BotStore, PrefsPatch, QuotaGate, RecordedSignal } from '@/services/bot/types';

/** Telegram chat ids are int64; anything else is rejected before it reaches SQL. */
export function toTelegramId(chatId: string): number {
  if (!/^-?\d{1,19}$/.test(chatId)) throw new Error('invalid telegram chat id');
  const n = Number(chatId);
  if (!Number.isSafeInteger(n)) throw new Error('telegram chat id out of range');
  return n;
}

export function createTelegramStore(db: SupabaseClient): BotStore {
  return {
    async touch(chatId, username) {
      const { error } = await db.rpc('touch_telegram_user', {
        p_telegram_id: toTelegramId(chatId),
        p_username: username ? username.slice(0, 64) : null,
      });
      if (error) throw error;
    },

    async redeemLink(chatId, code) {
      const { data, error } = await db.rpc('redeem_telegram_link', { p_telegram_id: toTelegramId(chatId), p_code: code });
      if (error) throw error;
      return { ok: !!data?.ok, reason: typeof data?.reason === 'string' ? data.reason : undefined };
    },

    async consumeSignal(chatId): Promise<QuotaGate> {
      const { data, error } = await db.rpc('consume_telegram_signal', { p_telegram_id: toTelegramId(chatId) });
      if (error) throw error;
      if (!data || typeof data !== 'object') throw new Error('consume_telegram_signal returned no result');
      return {
        allowed: data.allowed === true,
        remaining: typeof data.remaining === 'number' ? data.remaining : 0,
        linked: data.linked === true,
        pro: data.pro === true,
      };
    },

    async refundSignal(chatId) {
      const { error } = await db.rpc('refund_telegram_signal', { p_telegram_id: toTelegramId(chatId) });
      if (error) throw error;
    },

    async getAccountStatus(chatId) {
      const { data: tu, error } = await db
        .from('telegram_users')
        .select('user_id')
        .eq('telegram_id', toTelegramId(chatId))
        .maybeSingle();
      if (error) throw error;
      if (!tu?.user_id) return { linked: false, pro: false };
      const { data: prof, error: pErr } = await db
        .from('profiles')
        .select('subscription_status')
        .eq('id', tu.user_id)
        .maybeSingle();
      if (pErr) throw pErr;
      return { linked: true, pro: prof?.subscription_status === 'pro' };
    },

    async getPrefs(chatId) {
      const { data, error } = await db
        .from('telegram_prefs')
        .select('risk_level, coins, alerts_enabled, last_push_at')
        .eq('telegram_id', toTelegramId(chatId))
        .maybeSingle();
      if (error) throw error;
      return prefsFromRow(data);
    },

    async savePrefs(chatId, patch: PrefsPatch) {
      const { error } = await db.rpc('save_telegram_prefs', {
        p_telegram_id: toTelegramId(chatId),
        p_risk_level: patch.riskLevel ?? null,
        p_coins: patch.coins ?? null,
        p_alerts_enabled: patch.alertsEnabled ?? null,
      });
      if (error) throw error;
    },

    // Record a linked chat's call in `signals` so it is server-scored and
    // anchored like a web signal. `signals.user_id` is required, so unlinked
    // chats can't be recorded — the message then says so. Best-effort: never
    // blocks the reply.
    async recordSignal(chatId: string, symbol: string, analysis: AnalystTake): Promise<RecordedSignal | null> {
      try {
        const { data: tu } = await db
          .from('telegram_users')
          .select('user_id')
          .eq('telegram_id', toTelegramId(chatId))
          .maybeSingle();
        if (!tu?.user_id) return null;

        const price = await fetchSpotPrice(symbol);
        if (price == null) return null;

        const rec = buildSignalRecord(analysis, price);
        if (!rec) return null;

        const { data, error } = await db
          .from('signals')
          .insert({
            user_id: tu.user_id,
            symbol,
            action: rec.action,
            confidence: rec.confidence,
            entry_price: rec.entryPrice,
            target_price: rec.targetPrice,
            stop_loss: rec.stopLoss,
            reasoning: rec.reasoning,
            outcome: 'pending',
          })
          .select('id')
          .single();
        if (error) throw error;
        return { id: data.id as string, price };
      } catch (e) {
        console.warn('recording telegram signal failed (reply still sent):', e);
        return null;
      }
    },
  };
}
