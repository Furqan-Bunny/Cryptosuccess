// Daily alerts: one honest digest per opted-in, linked PRO chat, at most every
// 20h, covering up to 3 of the chat's coins. Generation is cache-first (one paid
// analysis per coin per 6h shared by everyone), so cost scales with the number
// of distinct coins, not chats. Pushes are NOT recorded as signals — the digest
// says so and points to /signal for a recorded, verifiable call.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerateResult } from '@/services/analyst.service';
import { isChatUnreachable } from '@/lib/telegram/api';
import { formatPushDigest, type PushItem } from '@/services/bot/format';
import { prefsFromRow } from '@/services/bot/prefs';
import { pushCoinsFor, pushCutoffIso, pushSkipReason, type PushSkipReason } from '@/services/bot/push';
import { isEffectivePro } from '@/lib/subscription-rules';
import { chunk } from '@/lib/chunk';

const BATCH_LIMIT = 500;

export interface PushJobDeps {
  db: SupabaseClient;
  send: (chatId: string, text: string) => Promise<void>;
  analyst: (symbol: string) => Promise<GenerateResult | null>;
  spotPrices: (symbols: string[]) => Promise<Record<string, number>>;
  verifyUrl: string;
  /** Epoch ms after which no NEW chat is started (the route's time budget). */
  startDeadline: number;
  /** Epoch ms after which no new analyst generation is started. */
  generateDeadline: number;
  /** Pause between chats — stays well under Telegram's ~30 msg/s bot limit. */
  delayMs?: number;
}

export interface PushJobResult {
  scanned: number;
  eligible: number;
  sent: number;
  failed: number;
  disabled: number; // chats that blocked the bot → alerts turned off
  skipped: Partial<Record<PushSkipReason | 'claimed_elsewhere' | 'no_coins', number>>;
  stoppedEarly: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runPushJob(deps: PushJobDeps): Promise<PushJobResult> {
  const { db } = deps;
  const result: PushJobResult = { scanned: 0, eligible: 0, sent: 0, failed: 0, disabled: 0, skipped: {}, stoppedEarly: false };
  const skip = (r: keyof PushJobResult['skipped']) => { result.skipped[r] = (result.skipped[r] ?? 0) + 1; };

  // Opted-in chats that are due (never pushed, or not within the minimum
  // interval), least-recently pushed first.
  const { data: prefRows, error } = await db
    .from('telegram_prefs')
    .select('telegram_id, risk_level, coins, alerts_enabled, last_push_at')
    .eq('alerts_enabled', true)
    .or(`last_push_at.is.null,last_push_at.lt.${pushCutoffIso(Date.now())}`)
    .order('last_push_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(error.message);
  if (!prefRows?.length) return result;
  result.scanned = prefRows.length;

  // Link + plan state for those chats (flat queries; no cross-table joins),
  // looked up in chunks so the `in (...)` lists stay well inside URL limits.
  const userByChat = new Map<string, string | null>();
  for (const ids of chunk(prefRows.map(r => r.telegram_id))) {
    const { data: users, error: uErr } = await db.from('telegram_users').select('telegram_id, user_id').in('telegram_id', ids);
    if (uErr) throw new Error(uErr.message);
    for (const u of users ?? []) userByChat.set(String(u.telegram_id), (u.user_id as string | null) ?? null);
  }

  const userIds = Array.from(new Set(Array.from(userByChat.values()).filter((v): v is string => !!v)));
  const statusByUser = new Map<string, string>();
  for (const ids of chunk(userIds)) {
    const { data: profiles, error: pErr } = await db
      .from('profiles')
      .select('id, subscription_status, plan_id, current_period_end')
      .in('id', ids);
    if (pErr) throw new Error(pErr.message);
    // A lapsed one-off crypto Pro is treated as free even before the expiry cron runs.
    for (const p of profiles ?? []) {
      const pro = isEffectivePro({
        status: p.subscription_status as string | null,
        planId: p.plan_id as string | null,
        currentPeriodEnd: p.current_period_end as string | null,
      });
      statusByUser.set(p.id as string, pro ? 'pro' : String(p.subscription_status));
    }
  }

  const now = Date.now();
  const ineligible: number[] = [];
  const eligible = prefRows.filter(row => {
    const chatId = String(row.telegram_id);
    const userId = userByChat.get(chatId) ?? null;
    const reason = pushSkipReason({
      alertsEnabled: row.alerts_enabled === true,
      linkedUserId: userId,
      subscriptionStatus: userId ? statusByUser.get(userId) ?? null : null,
      lastPushAt: (row.last_push_at as string | null) ?? null,
      chatId,
    }, now);
    if (reason) skip(reason);
    if (reason === 'not_linked' || reason === 'not_pro' || reason === 'not_private') ineligible.push(row.telegram_id as number);
    return !reason;
  });
  result.eligible = eligible.length;

  // Chats that keep alerts on but can't receive them (unlinked, Pro lapsed,
  // group chat) would otherwise stay at the front of every batch, and enough of
  // them would crowd out eligible Pro chats for good. Move them to the back of
  // the queue (their setting is kept, so alerts resume if they link / renew).
  for (const ids of chunk(ineligible)) {
    const { error: dErr } = await db
      .from('telegram_prefs')
      .update({ last_push_at: new Date(now).toISOString() })
      .in('telegram_id', ids);
    if (dErr) console.warn('push: could not defer ineligible chats:', dErr.message);
  }
  if (!eligible.length) return result;

  // One live price fetch for every coin involved (cached takes can be hours old).
  const allCoins = Array.from(new Set(eligible.flatMap(r => pushCoinsFor(prefsFromRow(r).coins))));
  let prices: Record<string, number> = {};
  try { prices = await deps.spotPrices(allCoins); } catch { /* digest just omits prices */ }

  // Per-run memo so each coin is generated/read at most once.
  const takes = new Map<string, GenerateResult | null>();
  const takeFor = async (symbol: string): Promise<GenerateResult | null> => {
    if (takes.has(symbol)) return takes.get(symbol) ?? null;
    if (Date.now() > deps.generateDeadline) return null; // out of time; not memoized
    let res: GenerateResult | null = null;
    try { res = await deps.analyst(symbol); } catch (e) { console.warn(`push: analyst failed for ${symbol}:`, e); }
    takes.set(symbol, res);
    return res;
  };

  for (const row of eligible) {
    if (Date.now() > deps.startDeadline) { result.stoppedEarly = true; break; }
    const chatId = String(row.telegram_id);
    const prefs = prefsFromRow(row);
    const previous = (row.last_push_at as string | null) ?? null;

    // Claim with compare-and-set on the value we read, so overlapping cron runs
    // can never push the same chat twice.
    const claimedAt = new Date().toISOString();
    let claim = db.from('telegram_prefs').update({ last_push_at: claimedAt }).eq('telegram_id', row.telegram_id).eq('alerts_enabled', true);
    claim = previous == null ? claim.is('last_push_at', null) : claim.eq('last_push_at', previous);
    const { data: claimed, error: cErr } = await claim.select('telegram_id');
    if (cErr || !claimed?.length) { skip('claimed_elsewhere'); continue; }

    const items: PushItem[] = [];
    for (const symbol of pushCoinsFor(prefs.coins)) {
      const take = await takeFor(symbol);
      if (take) items.push({ symbol, analysis: take.analysis, price: prices[symbol] ?? null });
    }

    const release = async () => {
      // Give the slot back so the next run retries this chat.
      await db.from('telegram_prefs').update({ last_push_at: previous }).eq('telegram_id', row.telegram_id).eq('last_push_at', claimedAt);
    };

    if (!items.length) {
      skip('no_coins');
      await release();
      continue;
    }

    try {
      await deps.send(chatId, formatPushDigest({ items, riskLevel: prefs.riskLevel, verifyUrl: deps.verifyUrl }));
      result.sent += 1;
    } catch (e) {
      if (isChatUnreachable(e)) {
        // The user blocked the bot / deleted the chat: stop pushing to it.
        await db.from('telegram_prefs').update({ alerts_enabled: false, updated_at: new Date().toISOString() }).eq('telegram_id', row.telegram_id);
        result.disabled += 1;
      } else {
        console.warn('push send failed:', e);
        await release();
        result.failed += 1;
      }
    }

    if (deps.delayMs) await sleep(deps.delayMs);
  }

  return result;
}
