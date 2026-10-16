// Accountability follow-ups: after a call given in Telegram is scored (outcome
// no longer pending), tell the user how it went — wins AND losses — exactly
// once, with a link to verify it. The telegram_followups primary key is the
// "sent once" guarantee: a row is claimed BEFORE sending, so overlapping runs
// can't double-send.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isChatUnreachable } from '@/lib/telegram/api';
import { formatFollowUp, type FollowUpSignal } from '@/services/bot/format';
import {
  FINAL_OUTCOMES, FOLLOWUP_LOOKBACK_MS, MAX_FOLLOWUPS_PER_CHAT_PER_RUN,
  pickFollowUpChat, toFollowUpSignal,
} from '@/services/bot/followups';
import { TELEGRAM_READ_PREFIX } from '@/services/bot/record';

const BATCH_LIMIT = 200;
// Upper bound on rows scanned per run (pages of BATCH_LIMIT).
const MAX_SCAN_PAGES = 10;

export interface FollowUpJobDeps {
  db: SupabaseClient;
  send: (chatId: string, text: string) => Promise<void>;
  verifyUrl: string;
  /** Epoch ms after which no new message is started. */
  deadline: number;
  delayMs?: number;
}

export interface FollowUpJobResult {
  candidates: number;
  sent: number;
  failed: number;
  unreachable: number;
  skipped: number;
  stoppedEarly: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runFollowUpJob(deps: FollowUpJobDeps): Promise<FollowUpJobResult> {
  const { db } = deps;
  const result: FollowUpJobResult = { candidates: 0, sent: 0, failed: 0, unreachable: 0, skipped: 0, stoppedEarly: false };
  const since = new Date(Date.now() - FOLLOWUP_LOOKBACK_MS).toISOString();

  // Recently finalized calls that were given in Telegram, NEWEST first, read in
  // pages. Rows already followed up are dropped page by page, so they can never
  // fill a batch and starve newer calls (a single oldest-first LIMIT let 200+
  // already-sent rows block every new follow-up until they aged out). Sending is
  // still bounded by the deadline and the per-chat cap below.
  const pending: Array<{ sig: FollowUpSignal; userId: string }> = [];
  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    const from = page * BATCH_LIMIT;
    const { data: rows, error } = await db
      .from('signals')
      .select('id, user_id, symbol, action, entry_price, target_price, stop_loss, outcome, profit_loss_percent, price_at_24h, reasoning, created_at, evaluated_at')
      .like('reasoning', `${TELEGRAM_READ_PREFIX}%`)
      .in('outcome', FINAL_OUTCOMES)
      .gte('evaluated_at', since)
      .order('evaluated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + BATCH_LIMIT - 1);
    if (error) throw new Error(error.message);
    if (!rows?.length) break;

    // Drop the ones already followed up.
    const { data: done, error: dErr } = await db.from('telegram_followups').select('signal_id').in('signal_id', rows.map(r => r.id));
    if (dErr) throw new Error(dErr.message);
    const doneIds = new Set((done ?? []).map(d => d.signal_id as string));

    for (const row of rows) {
      if (doneIds.has(row.id as string)) continue;
      const sig = toFollowUpSignal(row);
      if (!sig || typeof row.user_id !== 'string') { result.skipped += 1; continue; }
      pending.push({ sig, userId: row.user_id });
    }
    if (rows.length < BATCH_LIMIT) break;
  }
  result.candidates = pending.length;
  if (!pending.length) return result;

  // Where to send: the account's linked private chat (unlinked → skipped until
  // the lookback window passes).
  // Looked up in chunks so the id list stays well inside URL limits.
  const userIds = Array.from(new Set(pending.map(p => p.userId)));
  const chats: Array<{ telegram_id: unknown; user_id: unknown; updated_at: unknown }> = [];
  for (let i = 0; i < userIds.length; i += BATCH_LIMIT) {
    const { data, error: cErr } = await db
      .from('telegram_users')
      .select('telegram_id, user_id, updated_at')
      .in('user_id', userIds.slice(i, i + BATCH_LIMIT));
    if (cErr) throw new Error(cErr.message);
    chats.push(...(data ?? []));
  }
  const chatByUser = pickFollowUpChat(chats);

  const perChat = new Map<string, number>();
  for (const { sig, userId } of pending) {
    if (Date.now() > deps.deadline) { result.stoppedEarly = true; break; }
    const chatId = chatByUser.get(userId);
    if (!chatId) { result.skipped += 1; continue; }
    const count = perChat.get(chatId) ?? 0;
    if (count >= MAX_FOLLOWUPS_PER_CHAT_PER_RUN) { result.skipped += 1; continue; }

    // Claim first (PK on signal_id) — a conflict means another run has it.
    const { error: claimErr } = await db.from('telegram_followups').insert({ signal_id: sig.id, telegram_id: Number(chatId) });
    if (claimErr) { result.skipped += 1; continue; }
    perChat.set(chatId, count + 1);

    try {
      await deps.send(chatId, formatFollowUp(sig, deps.verifyUrl));
      result.sent += 1;
    } catch (e) {
      if (isChatUnreachable(e)) {
        // Keep the claim: the chat can't receive it, retrying would only fail again.
        result.unreachable += 1;
      } else {
        console.warn('follow-up send failed (will retry next run):', e);
        await db.from('telegram_followups').delete().eq('signal_id', sig.id);
        result.failed += 1;
      }
    }

    if (deps.delayMs) await sleep(deps.delayMs);
  }

  return result;
}
