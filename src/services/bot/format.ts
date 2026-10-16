// Honest-coach message formatting for the bot. Pure functions (no I/O) so they
// are fully unit-testable and the product guardrails are locked by tests. Output
// is plain text with no channel markup, so every channel adapter (Telegram today,
// WhatsApp later) can deliver it as-is.
//
// PRODUCT PRINCIPLES enforced here (never break these):
//   • Risk-first — every signal shows a stop-loss AND what you could lose.
//   • Honest about uncertainty — low conviction / HOLD => an explicit "stay out".
//   • Provably honest — every signal links the on-chain /verify track record, and
//     only calls that were actually recorded claim to be.
//   • Teaches — short reasoning + position-sizing guidance (never above 2% risk).
//   • Never "guaranteed" / "100x" / promises of profit.
import type { AnalystTake } from '@/services/analyst.service';
import type { SignalOutcome } from '@/lib/signal-outcome';
import { getCoinName } from '@/lib/coins';
import { MAX_COINS, riskBudget, riskBudgetLabel } from './prefs';
import type { AccountStatus, ChatPrefs, NotRecordedReason, RiskLevel } from './types';

/** Words we must never emit — the honest-coach promise. */
export const BANNED_PHRASES = ['guaranteed', 'guarantee', '100x', 'to the moon', 'risk-free', 'can\'t lose', 'cannot lose', 'sure thing'];

const CONVICTION_LABEL: Record<string, string> = {
  low: 'Low (timeframes conflict / choppy — treat with caution)',
  medium: 'Medium',
  high: 'High (still not a certainty — nobody predicts crypto)',
};

const VERDICT_EMOJI: Record<string, string> = { BUY: '🟢', SELL: '🔴', HOLD: '🟡' };

/** Extract the first numeric value from a price string like "$2,004.50" → 2004.5. */
export function parseFirstNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Mid-point of a range string ("2000–2050" / "$2000 to $2050"), else first number. */
export function parseRangeMid(s: string | undefined | null): number | null {
  if (!s) return null;
  const nums = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  if (nums.length === 1) return Number(nums[0]);
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number(nums[0]);
}

/** Percentage distance from entry to stop, if both are parseable. */
function stopDistancePct(entry: number | null, stop: number | null): number | null {
  if (entry == null || stop == null || entry === 0) return null;
  return Math.abs((stop - entry) / entry) * 100;
}

const DISCLAIMER = '⚠️ Not financial advice. Crypto is risky — you can lose money. Only risk what you can afford to lose.';

const STAY_OUT_LINE = '👉 Honest call: this is a STAY-OUT / wait setup. No trade is a valid trade.';

function isStayOut(st: AnalystTake['shortTerm']): boolean {
  return st.verdict === 'HOLD' || st.conviction === 'low';
}

/**
 * The max-loss / position-sizing lines for a risk level. Without a level the
 * classic "1–2%" rule is shown. Never suggests risking more than 2% per trade.
 */
export function sizingLines(riskLevel: RiskLevel | null | undefined, stopDistPct: number | null): string[] {
  const lines: string[] = [];
  const { maxPct } = riskBudget(riskLevel);
  if (!riskLevel || riskLevel === 'medium') {
    lines.push('• Max loss / sizing: never risk more than 1–2% of your account on one trade.');
  } else if (riskLevel === 'low') {
    lines.push(`• Max loss / sizing (your risk level: low): risk only ${riskBudgetLabel('low')} of your account on one trade.`);
  } else {
    lines.push(`• Max loss / sizing (your risk level: high): risk at most ${maxPct}% of your account on one trade — that is the ceiling, never more.`);
  }
  if (stopDistPct != null) {
    lines.push(`  With a ~${stopDistPct.toFixed(1)}% stop, keep the position small enough that hitting the stop costs ≤${maxPct}% of your account.`);
  }
  return lines;
}

/** Why a read isn't in the track record. Only an unlinked chat is told to /link. */
export function notRecordedLine(reason: NotRecordedReason | null | undefined): string {
  switch (reason) {
    case 'levels':
      return "This read is NOT recorded in our track record: its target and stop-loss couldn't be matched to the live price, so it can't be scored fairly.";
    case 'price':
      return "This read is NOT recorded in our track record: we couldn't get a live price to record it against.";
    case 'error':
      return 'This read is NOT recorded in our track record because saving it failed on our side.';
    default:
      return 'This read is NOT recorded in our track record. Link your account with /link so your calls are recorded and verifiable.';
  }
}

/**
 * Format one coin's analyst take as an honest-coach message.
 * Leads with the short-term read (what most users ask for) but always surfaces
 * a stop-loss, the max loss / sizing rule, honest confidence, and the /verify hook.
 */
export function formatSignal(params: {
  symbol: string;
  analysis: AnalystTake;
  price?: number | null;
  verifyUrl: string;
  remaining?: number; // free signals left today (-1 = unlimited/Pro)
  // Id of the `signals` row this call was recorded as, or null when it was NOT
  // recorded (unlinked chat / unparseable levels). Only recorded calls are
  // scored and anchored on-chain, so the message must never claim otherwise.
  recordedSignalId?: string | null;
  /** Why the call wasn't recorded (only the unlinked case is told to /link). */
  notRecordedReason?: NotRecordedReason | null;
  /** The chat's risk setting; adapts the sizing line (capped at 2%). */
  riskLevel?: RiskLevel | null;
}): string {
  const { symbol, analysis, price, verifyUrl, remaining, recordedSignalId, notRecordedReason, riskLevel } = params;
  const name = getCoinName(symbol);
  const st = analysis.shortTerm;
  const emoji = VERDICT_EMOJI[st.verdict] ?? '⚪';

  const entry = parseRangeMid(st.entryZone);
  const stop = parseFirstNumber(st.stop);
  const distPct = stopDistancePct(entry, stop);

  const lines: string[] = [];
  lines.push(`${emoji} ${name} (${symbol}) — honest read`);
  if (price != null && price > 0) lines.push(`Live price: $${formatPrice(price)}`);
  lines.push('');

  // The call + honest confidence.
  lines.push(`Call (short-term, ${st.horizon}): ${st.verdict}`);
  lines.push(`Confidence: ${CONVICTION_LABEL[st.conviction] ?? st.conviction}`);

  // Honest-uncertainty path: if HOLD or low conviction, say "stay out" plainly.
  if (isStayOut(st)) lines.push(STAY_OUT_LINE);
  lines.push('');

  // Risk-first block — always present.
  lines.push('📉 Risk first:');
  lines.push(`• Entry zone: ${st.entryZone}`);
  lines.push(`• Target: ${st.target}`);
  lines.push(`• Stop-loss: ${st.stop}${distPct != null ? ` (~${distPct.toFixed(1)}% from entry)` : ''}`);
  lines.push(`• Invalidation: ${st.invalidation}`);
  lines.push(...sizingLines(riskLevel, distPct));
  lines.push('');

  // Teach — short reasoning.
  lines.push('🧠 Why:');
  lines.push(truncate(st.thesis, 400));
  if (st.keyDrivers?.length) lines.push(`Drivers: ${st.keyDrivers.slice(0, 3).join('; ')}`);
  if (st.risks?.length) lines.push(`Risks: ${st.risks.slice(0, 3).join('; ')}`);
  lines.push('');

  // Long-term context (brief).
  lines.push(`🗓️ Longer-term (${analysis.longTerm.horizon}): ${analysis.longTerm.verdict} — ${truncate(analysis.longTerm.thesis, 220)}`);
  lines.push('');

  // Provably-honest hook — only claim on-chain recording for calls we actually recorded.
  if (recordedSignalId) {
    lines.push(`🔗 This call is recorded in our track record. After it's scored (24h) it is anchored on-chain, so we can't hide it if it loses → ${verifyUrl}?signalId=${recordedSignalId}`);
  } else {
    lines.push(`ℹ️ ${notRecordedLine(notRecordedReason)} Our verified track record → ${verifyUrl}`);
  }

  if (remaining != null && remaining >= 0) {
    lines.push('');
    lines.push(`Free signals left today: ${remaining}. Upgrade with /subscribe for unlimited.`);
  }

  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

export function welcomeMessage(verifyUrl: string): string {
  return [
    '👋 Welcome to CryptoSuccess — the honest AI trading coach.',
    '',
    "Most signal bots lie and hide their losers. We're different:",
    '• Provably honest — our track record is anchored on a public blockchain, so we CAN\'T secretly delete losing calls.',
    '• Risk-first — every call comes with a stop-loss and what you could lose.',
    "• Honest about uncertainty — when it's choppy, we tell you to stay out.",
    '• We teach, we don\'t hype — no empty hype, no fantasy multipliers, ever.',
    '',
    'Commands:',
    '• /signal BTC — get an honest read on a coin',
    '• /verify — check our on-chain track record',
    '• /link <code> — connect your CryptoSuccess account',
    '• /risk low|medium|high — set how much you risk per trade',
    '• /coins BTC ETH — the coins you follow',
    '• /subscribe — go Pro (unlimited signals)',
    '• /help — all commands',
    '',
    `🔗 Verify us first, before you trust us: ${verifyUrl}`,
    '',
    DISCLAIMER,
  ].join('\n');
}

export function helpMessage(): string {
  return [
    'CryptoSuccess — commands:',
    '• /signal <COIN> — honest read (e.g. /signal BTC, /signal ETH)',
    '• /verify — our provable on-chain track record',
    '• /link <code> — connect your account (get a code on the website)',
    '• /risk low|medium|high — your risk per trade (low 0.5–1%, medium 1–2%, high 2% max)',
    `• /coins BTC ETH SOL — the coins you follow (up to ${MAX_COINS})`,
    '• /alerts on|off — one daily read on your coins (Pro, linked account)',
    '• /settings — show your risk level, coins and alerts',
    '• /subscribe — upgrade to Pro for unlimited signals',
    '• /start — intro & principles',
    '• /help — this message',
    '',
    'Free tier: 5 signals/day. Pro: unlimited.',
  ].join('\n');
}

export function verifyMessage(verifyUrl: string): string {
  return [
    '🔗 Our track record is anchored on-chain (Base Sepolia) — we cannot secretly edit or delete a losing call.',
    `Verify any signal's inclusion trustlessly here: ${verifyUrl}`,
    '',
    'This is our core promise: honesty you can check yourself, not trust us on.',
  ].join('\n');
}

export function subscribeMessage(pricingUrl: string): string {
  return [
    '⭐ CryptoSuccess Pro — unlimited signals on the website and here, plus optional daily alerts.',
    `Upgrade here: ${pricingUrl}`,
    '',
    'After upgrading, link this chat with /link so Pro applies here too. Until then this chat keeps its own 5 free signals a day.',
    'Pro gives you more reads, not better odds. No promises of profit — just more of the honest coaching, whenever you want it.',
  ].join('\n');
}

export function linkSuccessMessage(): string {
  return '✅ Account linked. Your signals now count against your account plan (shared with the website) and are recorded in our verifiable track record. Run /signal BTC to try it.';
}

export function linkHelpMessage(appUrl: string, channelLabel = 'Telegram'): string {
  return [
    'To connect your CryptoSuccess account:',
    `1. Sign in at ${appUrl}/settings`,
    `2. Under "${channelLabel}", press "Generate link code".`,
    '3. Send it here within 15 minutes: /link <code>',
  ].join('\n');
}

export function linkFailedMessage(reason: string): string {
  const why =
    reason === 'expired' ? 'that code has expired' :
    reason === 'used' ? 'that code was already used' :
    'that code is not valid';
  return `❌ Couldn't link — ${why}. Generate a fresh code on the website and try /link <code> again.`;
}

export function limitReachedMessage(pricingUrl: string, linked = false): string {
  const lines = [
    "You've used your 5 free signals for today — resets at 00:00 UTC.",
    'Honest coaching is worth pacing anyway: overtrading is how most people lose.',
    `Want unlimited? Go Pro: ${pricingUrl}`,
  ];
  // An unlinked chat has its own free allowance: a Pro plan bought on the website
  // only applies here once the chat is linked.
  if (!linked) lines.push('Already Pro on the website? Link this chat with /link so your plan applies here.');
  return lines.join('\n');
}

export function unsupportedCoinMessage(symbol: string): string {
  return `I don't cover "${symbol.slice(0, 12)}" yet. Try a major coin, e.g. /signal BTC, /signal ETH, /signal SOL.`;
}

export function usageMessage(): string {
  return 'Usage: /signal <COIN> — e.g. /signal BTC';
}

export function errorMessage(): string {
  return "⚠️ Something went wrong generating that read. Please try again in a moment — and never trade on a signal you couldn't get.";
}

/** Same as errorMessage, plus the reassurance that no credit was used. */
export function generationFailedMessage(refunded: boolean): string {
  return refunded
    ? "⚠️ Something went wrong generating that read, so it didn't count against your daily signals. Please try again in a moment — and never trade on a signal you couldn't get."
    : errorMessage();
}

export function notConfiguredMessage(): string {
  return "⚙️ This feature isn't live yet — the signal backend (database + AI) is still being set up. Try /verify or /start for now.";
}

// ── abuse protection ────────────────────────────────────────────────────────
export function slowDownMessage(): string {
  return "⏳ You're sending messages faster than I can coach. Give it a minute and try again.";
}

export function signalRateLimitedMessage(): string {
  return '⏳ That\'s a lot of reads in a short time — please wait a few minutes before the next /signal. Honest tip: checking the chart every few minutes rarely improves a trade.';
}

export function linkRateLimitedMessage(): string {
  return '⏳ Too many /link attempts. Please wait 15 minutes, then generate a fresh code on the website and try again.';
}

export function tooLongMessage(): string {
  return "That message is too long for me. Send a command like /signal BTC — see /help for the list.";
}

export function privateOnlyMessage(): string {
  return '🔒 For privacy and fair daily limits, signals, account linking and settings only work in a private chat with me. Open a direct chat with the bot and send the command there.';
}

// ── personalization ─────────────────────────────────────────────────────────
const RISK_EXPLAIN: Record<RiskLevel, string> = {
  low: `low — risk ${riskBudgetLabel('low')} of your account per trade`,
  medium: `medium — risk ${riskBudgetLabel('medium')} of your account per trade`,
  high: `high — risk up to ${riskBudgetLabel('high')} of your account per trade (the ceiling; we never suggest more)`,
};

export function riskUsageMessage(current: RiskLevel): string {
  return [
    `Your risk level: ${RISK_EXPLAIN[current]}.`,
    '',
    'Change it with /risk low, /risk medium or /risk high.',
    'It sets the sizing guidance on every read. Even "high" is capped at 2% — protecting your account matters more than any single trade.',
  ].join('\n');
}

export function riskSavedMessage(level: RiskLevel): string {
  return `✅ Risk level set: ${RISK_EXPLAIN[level]}. Every read will size positions to that.`;
}

export function coinsUsageMessage(current: string[]): string {
  return [
    `Your coins: ${current.join(', ')}`,
    '',
    `Change them with e.g. /coins BTC ETH SOL (up to ${MAX_COINS}). Daily alerts cover the first 3.`,
  ].join('\n');
}

export function coinsSavedMessage(coins: string[]): string {
  return `✅ Following: ${coins.join(', ')}. Send /signal ${coins[0]} for a read now.`;
}

export function coinsErrorMessage(error: { kind: 'missing' } | { kind: 'unsupported'; symbols: string[] } | { kind: 'too_many'; count: number }): string {
  if (error.kind === 'unsupported') {
    return `I don't cover ${error.symbols.map(s => `"${s}"`).join(', ')} yet. Use major coins, e.g. /coins BTC ETH SOL.`;
  }
  if (error.kind === 'too_many') {
    return `That's ${error.count} coins — please pick at most ${MAX_COINS}. Focus beats spreading thin.`;
  }
  return `Usage: /coins BTC ETH SOL (up to ${MAX_COINS}).`;
}

export function alertsUsageMessage(enabled: boolean): string {
  return [
    `Daily alerts are ${enabled ? 'ON' : 'OFF'}.`,
    'Send /alerts on or /alerts off.',
    'Alerts = at most one honest read per day on up to 3 of your /coins (Pro, linked account).',
  ].join('\n');
}

export function alertsOnMessage(coins: string[]): string {
  return [
    `✅ Daily alerts ON for ${coins.slice(0, 3).join(', ')}.`,
    'You\'ll get at most one message a day — including "stay out" when there\'s no good setup.',
    'Send /alerts off any time to stop.',
  ].join('\n');
}

export function alertsOffMessage(): string {
  return '✅ Daily alerts OFF. You can still ask for a read any time with /signal <COIN>.';
}

export function alertsNeedLinkMessage(appUrl: string): string {
  return [
    'Daily alerts are a Pro feature, so they need a linked CryptoSuccess account.',
    linkHelpMessage(appUrl),
  ].join('\n');
}

export function alertsNeedProMessage(pricingUrl: string): string {
  return [
    'Daily alerts are part of Pro — each one runs a fresh analysis, so we keep them to paying members to keep the free tier sustainable.',
    `Upgrade here: ${pricingUrl}`,
    'Free users can still ask for 5 reads a day with /signal <COIN>.',
  ].join('\n');
}

export function settingsMessage(prefs: ChatPrefs, account: AccountStatus): string {
  return [
    '⚙️ Your settings:',
    `• Risk level: ${RISK_EXPLAIN[prefs.riskLevel]}`,
    `• Coins: ${prefs.coins.join(', ')}`,
    `• Daily alerts: ${prefs.alertsEnabled ? 'ON' : 'OFF'}`,
    `• Account: ${account.linked ? (account.pro ? 'linked (Pro)' : 'linked (Free)') : 'not linked — see /link'}`,
    '',
    'Change with /risk, /coins and /alerts.',
  ].join('\n');
}

// ── scheduled push (daily digest) ───────────────────────────────────────────
export interface PushItem {
  symbol: string;
  analysis: AnalystTake;
  price: number | null;
}

/**
 * The daily alert digest. Compact per coin, but still risk-first: every coin
 * shows its stop, the stay-out path is explicit, sizing follows the chat's risk
 * level, and the message says plainly these reads are NOT in the track record
 * (pushes are not recorded as signals).
 */
export function formatPushDigest(params: { items: PushItem[]; riskLevel: RiskLevel; verifyUrl: string }): string {
  const { items, riskLevel, verifyUrl } = params;
  const lines: string[] = [];
  lines.push(`🗞️ Your daily honest read — ${items.map(i => i.symbol).join(', ')}`);
  lines.push('(You turned daily alerts on. Send /alerts off to stop them any time.)');

  for (const { symbol, analysis, price } of items) {
    const st = analysis.shortTerm;
    const entry = parseRangeMid(st.entryZone);
    const stop = parseFirstNumber(st.stop);
    const distPct = stopDistancePct(entry, stop);
    lines.push('');
    lines.push(`${VERDICT_EMOJI[st.verdict] ?? '⚪'} ${getCoinName(symbol)} (${symbol})${price != null && price > 0 ? ` · $${formatPrice(price)}` : ''}`);
    lines.push(`Call (${st.horizon}): ${st.verdict} · Confidence: ${CONVICTION_LABEL[st.conviction] ?? st.conviction}`);
    if (isStayOut(st)) lines.push(STAY_OUT_LINE);
    lines.push(`Entry ${st.entryZone} · Target ${st.target} · Stop-loss ${st.stop}${distPct != null ? ` (~${distPct.toFixed(1)}%)` : ''}`);
    lines.push(truncate(st.thesis, 220));
  }

  lines.push('');
  lines.push('📉 Risk first:');
  lines.push(...sizingLines(riskLevel, null));
  lines.push('• If none of these fit your plan, sitting out is a perfectly good decision.');
  lines.push('');
  lines.push(`ℹ️ These digest reads are NOT recorded in our track record. For a recorded, verifiable call send /signal <COIN>. Our verified track record → ${verifyUrl}`);
  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

// ── accountability follow-up ────────────────────────────────────────────────
export interface FollowUpSignal {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  outcome: SignalOutcome;
  profitLossPercent: number;
  priceAt24h: number | null;
  createdAt: string;
}

// Scoring checks ONE price, taken 24h+ after the call (see deriveOutcome), not
// the path in between, so every label describes that single check.
const OUTCOME_LABEL: Record<SignalOutcome, string> = {
  hit_target: '✅ WIN — at the 24h check the price was past the target',
  hit_stop: '❌ LOSS — at the 24h check the price was past the stop-loss',
  expired_profit: '✅ Small WIN — at the 24h check the price was in profit, short of the target',
  expired_loss: '❌ LOSS — at the 24h check the price was at a loss, short of the stop-loss',
};

const SCORING_NOTE =
  'How it was scored: one price check 24h after the call. Moves in between are not counted, so if your stop-loss was touched earlier, your real result may differ.';

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/**
 * The honest result of a call we gave this chat, sent once after it is scored.
 * Losses are reported exactly as plainly as wins.
 */
export function formatFollowUp(sig: FollowUpSignal, verifyUrl: string): string {
  const name = getCoinName(sig.symbol);
  const day = sig.createdAt.slice(0, 10);
  const lines: string[] = [];
  lines.push(`📋 Follow-up on your ${name} (${sig.symbol}) call from ${day}`);
  lines.push('');

  if (sig.action === 'HOLD') {
    lines.push('Call: HOLD / stay out.');
    if (sig.priceAt24h != null && sig.entryPrice > 0) {
      const move = ((sig.priceAt24h - sig.entryPrice) / sig.entryPrice) * 100;
      lines.push(`Price over the next 24h: $${formatPrice(sig.entryPrice)} → $${formatPrice(sig.priceAt24h)} (${signed(move)}).`);
    }
    lines.push('A stay-out call is scored as neutral and is not counted in our win rate.');
  } else {
    lines.push(`Call: ${sig.action} at $${formatPrice(sig.entryPrice)} · target $${formatPrice(sig.targetPrice)} · stop $${formatPrice(sig.stopLoss)}`);
    if (sig.priceAt24h != null) {
      const move = ((sig.priceAt24h - sig.entryPrice) / sig.entryPrice) * 100;
      lines.push(`Price after 24h: $${formatPrice(sig.priceAt24h)} (${signed(move)} from entry).`);
    }
    lines.push(`Result: ${OUTCOME_LABEL[sig.outcome]} · ${signed(sig.profitLossPercent)} on the call.`);
    lines.push(SCORING_NOTE);
    lines.push('');
    if (sig.outcome === 'hit_stop' || sig.outcome === 'expired_loss') {
      lines.push('We got this one wrong, and we\'re telling you straight. Losses are part of trading — that\'s exactly why every call comes with a stop-loss and a 1–2% max risk per trade.');
    } else {
      lines.push('This one worked — but one win says little about the next call. Keep sizing small and keep using the stop.');
    }
  }

  lines.push('');
  lines.push(`🔗 Finalized calls go into our daily on-chain anchor, wins and losses alike. Once anchored you can check this one yourself → ${verifyUrl}?signalId=${sig.id}`);
  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

// ── helpers ─────────────────────────────────────────────────────────────────
function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}
