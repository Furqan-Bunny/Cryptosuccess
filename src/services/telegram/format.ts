// Honest-coach message formatting for the Telegram bot. Pure functions (no I/O)
// so they are fully unit-testable and the product guardrails are locked by tests.
//
// PRODUCT PRINCIPLES enforced here (never break these):
//   • Risk-first — every signal shows a stop-loss AND what you could lose.
//   • Honest about uncertainty — low conviction / HOLD => an explicit "stay out".
//   • Provably honest — every signal links the on-chain /verify track record.
//   • Teaches — short reasoning + position-sizing guidance.
//   • Never "guaranteed" / "100x" / promises of profit.
import type { AnalystTake } from '@/services/analyst.service';
import { getCoinName } from '@/lib/coins';

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

/**
 * Format one coin's analyst take as an honest-coach Telegram message.
 * Leads with the short-term read (what most users ask for) but always surfaces
 * a stop-loss, the max loss / sizing rule, honest confidence, and the /verify hook.
 */
export function formatSignal(params: {
  symbol: string;
  analysis: AnalystTake;
  price?: number | null;
  verifyUrl: string;
  remaining?: number; // free signals left today (-1 = unlimited/Pro)
}): string {
  const { symbol, analysis, price, verifyUrl, remaining } = params;
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
  if (st.verdict === 'HOLD' || st.conviction === 'low') {
    lines.push('👉 Honest call: this is a STAY-OUT / wait setup. No trade is a valid trade.');
  }
  lines.push('');

  // Risk-first block — always present.
  lines.push('📉 Risk first:');
  lines.push(`• Entry zone: ${st.entryZone}`);
  lines.push(`• Target: ${st.target}`);
  lines.push(`• Stop-loss: ${st.stop}${distPct != null ? ` (~${distPct.toFixed(1)}% from entry)` : ''}`);
  lines.push(`• Invalidation: ${st.invalidation}`);
  lines.push('• Max loss / sizing: never risk more than 1–2% of your account on one trade.');
  if (distPct != null) {
    lines.push(`  With a ~${distPct.toFixed(1)}% stop, keep the position small enough that hitting the stop costs ≤2% of your account.`);
  }
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

  // Provably-honest hook — our edge.
  lines.push(`🔗 We can't hide losing calls: verify our track record on-chain → ${verifyUrl}`);

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
    '⭐ CryptoSuccess Pro — unlimited signals + priority coins.',
    `Upgrade here: ${pricingUrl}`,
    '',
    'Free tier stays 5 signals/day. No "guaranteed returns" — just more of the honest coaching, whenever you want it.',
  ].join('\n');
}

export function linkSuccessMessage(): string {
  return '✅ Account linked. Pro perks (if any) now apply to your Telegram signals. Run /signal BTC to try it.';
}

export function linkHelpMessage(appUrl: string): string {
  return [
    'To connect your CryptoSuccess account:',
    `1. Sign in at ${appUrl} and open your account settings.`,
    '2. Generate a Telegram link code.',
    '3. Send it here: /link <code>',
  ].join('\n');
}

export function linkFailedMessage(reason: string): string {
  const why =
    reason === 'expired' ? 'that code has expired' :
    reason === 'used' ? 'that code was already used' :
    'that code is not valid';
  return `❌ Couldn't link — ${why}. Generate a fresh code on the website and try /link <code> again.`;
}

export function limitReachedMessage(pricingUrl: string): string {
  return [
    "You've used your 5 free signals for today — resets at 00:00 UTC.",
    'Honest coaching is worth pacing anyway: overtrading is how most people lose.',
    `Want unlimited? Go Pro: ${pricingUrl}`,
  ].join('\n');
}

export function unsupportedCoinMessage(symbol: string): string {
  return `I don't cover "${symbol}" yet. Try a major coin, e.g. /signal BTC, /signal ETH, /signal SOL.`;
}

export function usageMessage(): string {
  return 'Usage: /signal <COIN> — e.g. /signal BTC';
}

export function errorMessage(): string {
  return "⚠️ Something went wrong generating that read. Please try again in a moment — and never trade on a signal you couldn't get.";
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
