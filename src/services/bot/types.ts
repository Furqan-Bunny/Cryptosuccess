// Contracts between the channel-agnostic bot core (core.ts) and the things that
// differ per messaging channel: how a message is delivered (ChannelAdapter) and
// where chat state lives (BotStore). Telegram implements both today; a WhatsApp
// adapter only needs its own implementations — the routing, quotas, honesty
// guardrails and formatting are shared.
import type { AnalystTake, GenerateResult } from '@/services/analyst.service';
import type { RateLimitResult } from '@/lib/server/rate-limit';

export type BotChannel = 'telegram' | 'whatsapp';

/** Private 1:1 chat vs. any multi-member chat (group / supergroup / channel). */
export type ChatKind = 'private' | 'group';

export interface IncomingMessage {
  channel: BotChannel;
  /** Channel-native chat id, as a string (Telegram ids are int64). */
  chatId: string;
  chatKind: ChatKind;
  text: string;
  username: string | null;
}

export interface ChannelAdapter {
  channel: BotChannel;
  /** Deliver plain text (the adapter splits/escapes as its channel requires). */
  send(chatId: string, text: string): Promise<void>;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ChatPrefs {
  riskLevel: RiskLevel;
  coins: string[];
  alertsEnabled: boolean;
  lastPushAt: string | null;
}

export type PrefsPatch = Partial<Pick<ChatPrefs, 'riskLevel' | 'coins' | 'alertsEnabled'>>;

/** Result of the atomic quota RPC (consume_telegram_signal). */
export interface QuotaGate {
  allowed: boolean;
  remaining: number; // -1 = unlimited (Pro) — nothing was consumed
  linked: boolean;
  pro: boolean;
}

export interface AccountStatus {
  linked: boolean;
  pro: boolean;
}

export interface LinkResult {
  ok: boolean;
  reason?: string;
}

/** A call written to `signals` (scored after 24h, then anchored on-chain). */
export interface RecordedSignal {
  id: string;
  price: number;
}

/**
 * Why a read was NOT written to the track record:
 *   unlinked — the chat isn't linked to an account (signals need a user id),
 *   price    — no live price to use as the entry,
 *   levels   — the read's target/stop couldn't be parsed or contradict the live price,
 *   error    — the insert failed.
 */
export type NotRecordedReason = 'unlinked' | 'price' | 'levels' | 'error';

export type RecordOutcome =
  | ({ recorded: true } & RecordedSignal)
  | { recorded: false; reason: NotRecordedReason };

/**
 * Per-channel persistence. Every method derives identity from the chat id the
 * channel verified — callers never pass a user id.
 */
export interface BotStore {
  touch(chatId: string, username: string | null): Promise<void>;
  redeemLink(chatId: string, code: string): Promise<LinkResult>;
  /** Atomically consume one signal credit. Throws on any DB failure (caller fails closed). */
  consumeSignal(chatId: string): Promise<QuotaGate>;
  /**
   * Give back a credit consumed for a read that could not be produced. Resolves
   * true only when a credit was actually returned (the RPC can legitimately
   * refund nothing, e.g. after the UTC day rolled over). Throws on DB failure.
   */
  refundSignal(chatId: string): Promise<boolean>;
  getAccountStatus(chatId: string): Promise<AccountStatus>;
  getPrefs(chatId: string): Promise<ChatPrefs>;
  savePrefs(chatId: string, patch: PrefsPatch): Promise<void>;
  /** Record a linked chat's call in the track record, or say why it wasn't. Never throws. */
  recordSignal(chatId: string, symbol: string, analysis: AnalystTake): Promise<RecordOutcome>;
}

export type RateLimiter = (name: string, id: string, limit: number, windowSec: number) => Promise<RateLimitResult>;

export interface BotDeps {
  adapter: ChannelAdapter;
  /** null = database not configured (DB-free commands still work). */
  store: BotStore | null;
  /** null = analyst (Anthropic) not configured. Cache-first generation. */
  analyst: ((symbol: string) => Promise<GenerateResult | null>) | null;
  /** Shared (cross-instance) limiter — Upstash in production, fails open. */
  limiter: RateLimiter;
  /** Public app URL for /verify, /pricing and /settings links. */
  baseUrl: string;
  /**
   * Optional server error reporter (logs + error_events + admin alert). When
   * absent, failures are only written to the console.
   */
  reportError?: (context: string, error: unknown) => Promise<void>;
}
