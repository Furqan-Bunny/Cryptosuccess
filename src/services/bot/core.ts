// Channel-agnostic bot core: command routing, abuse limits, quota metering and
// the honest-coach business rules. Channels (Telegram webhook today, WhatsApp
// later) only verify + parse their inbound payload into an IncomingMessage and
// supply a ChannelAdapter + BotStore — everything below is shared.
//
// Group-chat policy: the quota, account link and preferences are keyed by CHAT
// id, so in a group every member would share (and could spend) one allowance —
// and a /link code typed there is visible to everyone. Therefore in group chats
// only the informational commands (/start, /help, /verify, /subscribe) are
// answered; private-only commands get a one-line "message me directly" reply;
// plain chatter and unknown commands are ignored so the bot never spams a group.
import { isSupportedCoin } from '@/lib/coins';
import { findCommand } from './commands';
import {
  formatSignal, welcomeMessage, helpMessage, verifyMessage, subscribeMessage,
  linkSuccessMessage, linkHelpMessage, linkFailedMessage, limitReachedMessage,
  unsupportedCoinMessage, usageMessage, errorMessage, generationFailedMessage,
  notConfiguredMessage, slowDownMessage, signalRateLimitedMessage, linkRateLimitedMessage,
  tooLongMessage, privateOnlyMessage, riskUsageMessage, riskSavedMessage,
  coinsUsageMessage, coinsSavedMessage, coinsErrorMessage, alertsUsageMessage,
  alertsOnMessage, alertsOffMessage, alertsNeedLinkMessage, alertsNeedProMessage,
  settingsMessage,
} from './format';
import { DEFAULT_PREFS, parseCoinsArg, parseRiskArg, parseToggleArg } from './prefs';
import {
  LIMITS, MAX_INPUT_CHARS, MemoryRateLimiter, allowLinkAttempt, allowShared,
  limiterKey, linkMemoryLimiter, shouldSendLimitNotice,
} from './rate-limit';
import type { BotDeps, BotStore, ChatPrefs, IncomingMessage, QuotaGate } from './types';
import type { GenerateResult } from '@/services/analyst.service';

/** Link codes are minted as 8 chars from an unambiguous A–Z/2–9 alphabet. */
const LINK_CODE_RE = /^[A-Z0-9]{6,16}$/;

export interface ParsedCommand {
  /** Lower-cased command without the leading "/" or "@botname" ("" for plain text). */
  command: string;
  arg: string;
  isCommand: boolean;
}

/** Split "/Signal@MyBot  btc" into { command: 'signal', arg: 'btc' }. */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { command: '', arg: trimmed, isCommand: false };
  const [rawCmd, ...rest] = trimmed.split(/\s+/);
  const command = rawCmd.slice(1).toLowerCase().replace(/@.*$/, '');
  return { command, arg: rest.join(' ').trim(), isCommand: true };
}

/**
 * Handle one inbound message end to end. Never throws: any unexpected failure is
 * logged and answered with a generic error so the channel can always ACK.
 */
export async function handleIncoming(msg: IncomingMessage, deps: BotDeps, memory: MemoryRateLimiter = linkMemoryLimiter): Promise<void> {
  const text = msg.text.trim();
  if (!text || !msg.chatId) return;
  const parsed = parseCommand(text);
  const isPrivate = msg.chatKind === 'private';

  // Groups: answer only known commands, never chatter (see header).
  let privateOnlyInGroup = false;
  if (!isPrivate) {
    const known = parsed.isCommand ? findCommand(parsed.command) : undefined;
    if (!known) return;
    privateOnlyInGroup = !known.groupSafe;
  }

  const key = limiterKey(msg.channel, msg.chatId);
  const send = (t: string) => deps.adapter.send(msg.chatId, t);

  try {
    // 1. General flood limit — before ANY other work (DB, parsing, generation).
    if (!(await allowShared(deps.limiter, LIMITS.general, key))) {
      if (await shouldSendLimitNotice(deps.limiter, LIMITS.general, key)) await send(slowDownMessage());
      return;
    }

    // 2. Oversized input: refuse before parsing anything out of it.
    if (text.length > MAX_INPUT_CHARS) return await send(tooLongMessage());

    if (privateOnlyInGroup) return await send(privateOnlyMessage());

    // 3. Record the contact (private chats only; fire-and-forget so it never
    // delays the reply).
    if (isPrivate && deps.store) {
      const store = deps.store;
      void store.touch(msg.chatId, msg.username).catch(e => console.warn('bot touch failed (non-fatal):', e));
    }

    await route(msg, parsed, deps, send, memory);
  } catch (e) {
    await reportFailure(deps, `bot.${msg.channel}.handler`, e);
    try { await send(errorMessage()); } catch {}
  }
}

type Send = (text: string) => Promise<void>;

/** Report a handled failure through the channel's reporter, or the console. */
async function reportFailure(deps: BotDeps, context: string, error: unknown): Promise<void> {
  if (!deps.reportError) {
    console.error(`${context}:`, error);
    return;
  }
  try {
    await deps.reportError(context, error);
  } catch {
    /* reporting must never break a reply */
  }
}

async function route(msg: IncomingMessage, parsed: ParsedCommand, deps: BotDeps, send: Send, memory: MemoryRateLimiter): Promise<void> {
  const base = deps.baseUrl;
  const { command, arg } = parsed;

  if (!parsed.isCommand) {
    // Bare text with no command: treat a single token as a coin symbol.
    if (/^[a-z0-9]{2,6}$/i.test(arg)) return handleSignal(msg, arg, deps, send);
    return send(helpMessage());
  }

  switch (command) {
    case 'start':
      return send(welcomeMessage(`${base}/verify`));
    case 'help':
      return send(helpMessage());
    case 'verify':
      return send(verifyMessage(`${base}/verify`));
    case 'subscribe':
      return send(subscribeMessage(`${base}/pricing`));
    case 'link':
      return handleLink(msg, arg, deps, send, memory);
    case 'signal':
      return handleSignal(msg, arg, deps, send);
    case 'risk':
      return withStore(deps, send, store => handleRisk(msg, arg, store, send));
    case 'coins':
      return withStore(deps, send, store => handleCoins(msg, arg, store, send));
    case 'alerts':
      return withStore(deps, send, store => handleAlerts(msg, arg, store, base, send));
    case 'settings':
      return withStore(deps, send, async store => {
        const [prefs, account] = await Promise.all([store.getPrefs(msg.chatId), store.getAccountStatus(msg.chatId)]);
        return send(settingsMessage(prefs, account));
      });
    default:
      return send(helpMessage());
  }
}

/** Run a DB-backed command, or explain that the backend isn't configured. */
async function withStore(deps: BotDeps, send: Send, fn: (store: BotStore) => Promise<void>): Promise<void> {
  if (!deps.store) return send(notConfiguredMessage());
  try {
    await fn(deps.store);
  } catch (e) {
    await reportFailure(deps, 'bot.settings', e);
    await send(errorMessage());
  }
}

async function handleLink(msg: IncomingMessage, arg: string, deps: BotDeps, send: Send, memory: MemoryRateLimiter): Promise<void> {
  if (!deps.store) return send(notConfiguredMessage());
  const code = arg.trim().toUpperCase();
  if (!code) return send(linkHelpMessage(deps.baseUrl));

  // Brute-force guard: counted per attempt BEFORE the code is looked up.
  if (!(await allowLinkAttempt(deps.limiter, memory, limiterKey(msg.channel, msg.chatId)))) {
    return send(linkRateLimitedMessage());
  }
  if (!LINK_CODE_RE.test(code)) return send(linkFailedMessage('invalid'));

  try {
    const res = await deps.store.redeemLink(msg.chatId, code);
    if (res.ok) return send(linkSuccessMessage());
    return send(linkFailedMessage(res.reason ?? 'invalid'));
  } catch (e) {
    await reportFailure(deps, 'bot.link', e);
    return send(errorMessage());
  }
}

async function handleSignal(msg: IncomingMessage, arg: string, deps: BotDeps, send: Send): Promise<void> {
  const symbol = arg.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 12);
  if (!symbol) return send(usageMessage());
  if (!isSupportedCoin(symbol)) return send(unsupportedCoinMessage(symbol));

  // Backend not ready (no DB to meter against, or no AI key to reason with).
  const { store, analyst } = deps;
  if (!store || !analyst) return send(notConfiguredMessage());

  // Cost/abuse limit — checked before a credit is consumed.
  if (!(await allowShared(deps.limiter, LIMITS.signal, limiterKey(msg.channel, msg.chatId)))) {
    return send(signalRateLimitedMessage());
  }

  // Enforce Free/Pro limits (fail CLOSED — never hand out a signal we can't meter).
  let gate: QuotaGate;
  try {
    gate = await store.consumeSignal(msg.chatId);
  } catch (e) {
    // Denied (fail closed); reported so a broken quota RPC is noticed.
    await reportFailure(deps, 'bot.quota', e);
    return send(errorMessage());
  }
  if (!gate.allowed) return send(limitReachedMessage(`${deps.baseUrl}/pricing`, gate.linked));

  // Perceived latency: acknowledge before the (up-to-tens-of-seconds) generation.
  try { await send(`🧠 Reading ${symbol} across timeframes + latest news… one moment.`); } catch {}

  let result: GenerateResult | null = null;
  try {
    result = await analyst(symbol);
  } catch (e) {
    await reportFailure(deps, 'bot.analyst', e);
  }
  if (!result) {
    // N14: the user got nothing, so give the credit back (Pro consumed nothing).
    const refunded = await refundCredit(store, msg.chatId, gate);
    return send(generationFailedMessage(refunded));
  }

  let prefs: ChatPrefs = DEFAULT_PREFS;
  try { prefs = await store.getPrefs(msg.chatId); } catch (e) { console.warn('prefs read failed (using defaults):', e); }

  const recorded = await store.recordSignal(msg.chatId, symbol, result.analysis);

  return send(formatSignal({
    symbol,
    analysis: result.analysis,
    price: recorded.recorded ? recorded.price : result.price,
    verifyUrl: `${deps.baseUrl}/verify`,
    remaining: gate.remaining,
    recordedSignalId: recorded.recorded ? recorded.id : null,
    notRecordedReason: recorded.recorded ? null : recorded.reason,
    riskLevel: prefs.riskLevel,
  }));
}

/** Refund a consumed credit; true only when the store confirms a credit was returned. */
export async function refundCredit(store: BotStore, chatId: string, gate: QuotaGate): Promise<boolean> {
  if (gate.remaining === -1) return false; // unlimited — nothing was consumed
  try {
    return await store.refundSignal(chatId);
  } catch (e) {
    console.error('signal refund failed:', e);
    return false;
  }
}

async function handleRisk(msg: IncomingMessage, arg: string, store: BotStore, send: Send): Promise<void> {
  const parsed = parseRiskArg(arg);
  if (!parsed.ok) {
    const prefs = await store.getPrefs(msg.chatId);
    return send(riskUsageMessage(prefs.riskLevel));
  }
  await store.savePrefs(msg.chatId, { riskLevel: parsed.value });
  return send(riskSavedMessage(parsed.value));
}

async function handleCoins(msg: IncomingMessage, arg: string, store: BotStore, send: Send): Promise<void> {
  const parsed = parseCoinsArg(arg);
  if (!parsed.ok) {
    if (parsed.error.kind === 'missing') {
      const prefs = await store.getPrefs(msg.chatId);
      return send(coinsUsageMessage(prefs.coins));
    }
    return send(coinsErrorMessage(parsed.error));
  }
  await store.savePrefs(msg.chatId, { coins: parsed.value });
  return send(coinsSavedMessage(parsed.value));
}

async function handleAlerts(msg: IncomingMessage, arg: string, store: BotStore, base: string, send: Send): Promise<void> {
  const parsed = parseToggleArg(arg);
  if (!parsed.ok) {
    const prefs = await store.getPrefs(msg.chatId);
    return send(alertsUsageMessage(prefs.alertsEnabled));
  }
  if (!parsed.value) {
    await store.savePrefs(msg.chatId, { alertsEnabled: false });
    return send(alertsOffMessage());
  }
  // Turning ON is Pro-only (each push may run a paid analysis).
  const account = await store.getAccountStatus(msg.chatId);
  if (!account.linked) return send(alertsNeedLinkMessage(base));
  if (!account.pro) return send(alertsNeedProMessage(`${base}/pricing`));
  await store.savePrefs(msg.chatId, { alertsEnabled: true });
  const prefs = await store.getPrefs(msg.chatId);
  return send(alertsOnMessage(prefs.coins));
}
