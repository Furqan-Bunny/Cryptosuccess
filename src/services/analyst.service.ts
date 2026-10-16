// Shared Claude analyst "brain" — the multi-timeframe read + live-news research
// that powers BOTH the web `/api/ai/analyst` route and the Telegram bot. Kept in
// one place so the two surfaces reason identically and the honest-coach prompt
// lives in a single source of truth.
//
// This module is quota-agnostic: callers (web route, bot) enforce their own
// Free/Pro limits and auth BEFORE calling generateAnalystTake. All it does is
// serve a fresh cached take or generate + cache a new one.
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMarketContext } from '@/services/market-context.service';
import { getCoinName } from '@/lib/coins';
import { fetchSpotPrice } from '@/lib/server/binance-server';

// Reasoning model for the final analyst read; a cheaper model handles the
// throwaway news-summary step (see RESEARCH_MODEL).
const MODEL = 'claude-sonnet-4-6';
const RESEARCH_MODEL = 'claude-haiku-4-5';

// How long a cached analyst take stays fresh. The expensive part (news + the
// multi-timeframe read) is coin-level and doesn't change minute-to-minute, so we
// serve one paid analysis per coin per window to every user. Bumping this lowers
// cost further at the expense of news freshness.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// If the live spot price has moved more than this % since a cached take was
// generated, treat it as stale and regenerate even within the TTL — a stale
// "bullish" read shouldn't be served through a sharp move.
const STALE_MOVE_PCT = 5;

const RESEARCH_SYSTEM = `You are a crypto research assistant. Use web search to find the most recent news, catalysts, regulatory developments, and market sentiment for the given coin. Be concise and strictly factual — never invent sources or events. If little is found, say so plainly.`;

const ANALYST_SYSTEM = `You are a seasoned cryptocurrency trading analyst. You are given a coin's behavior across multiple timeframes (1h/4h/1d/1w: trend, regime, volatility, momentum, position-in-range, key levels) and a live news summary. Reason over ALL of it like a disciplined human trader and return TWO reads via the emit_trade_analysis tool: a short-term read (days) and a long-term read (weeks to months).

Hard rules:
- You are NOT a price oracle. Short-term direction is close to unpredictable; even good traders are right ~50-55% of the time and profit through risk management, not accuracy. Calibrate conviction accordingly — use low/medium when timeframes conflict or the regime is choppy.
- NEVER use "guaranteed", "will", "certain", "definitely", or promise profit. Use measured language ("leans", "favors", "suggests").
- Use the multi-timeframe behavior to justify each read: align or contrast the short-term and long-term pictures explicitly.
- Be specific and concise. thesis: 2-3 sentences. keyDrivers/risks: short factual bullets. Levels/targets/stops as price strings.
- This is analysis, not financial advice.`;

const TRADE_TOOL: Anthropic.Tool = {
  name: 'emit_trade_analysis',
  description: 'Return your structured short-term and long-term analysis of this coin.',
  input_schema: {
    type: 'object',
    properties: {
      overallBias: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
      newsSummary: { type: 'string' },
      shortTerm: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
          conviction: { type: 'string', enum: ['low', 'medium', 'high'] },
          horizon: { type: 'string' },
          thesis: { type: 'string' },
          keyDrivers: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          entryZone: { type: 'string' },
          target: { type: 'string' },
          stop: { type: 'string' },
          invalidation: { type: 'string' },
        },
        required: ['verdict', 'conviction', 'horizon', 'thesis', 'keyDrivers', 'risks', 'entryZone', 'target', 'stop', 'invalidation'],
      },
      longTerm: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
          conviction: { type: 'string', enum: ['low', 'medium', 'high'] },
          horizon: { type: 'string' },
          thesis: { type: 'string' },
          keyDrivers: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          keyLevels: { type: 'string' },
          invalidation: { type: 'string' },
        },
        required: ['verdict', 'conviction', 'horizon', 'thesis', 'keyDrivers', 'risks', 'keyLevels', 'invalidation'],
      },
    },
    required: ['overallBias', 'newsSummary', 'shortTerm', 'longTerm'],
  },
};

// Cost control: web_search returns short result snippets (cheap), whereas
// web_fetch pulls ENTIRE pages into context (tens of thousands of tokens each)
// and was the dominant cost — so it is deliberately removed. Search is also
// capped to 2 uses and runs on the cheap research model. Single pass, no
// pause_turn re-loop.
const WEB_TOOLS: any[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 2 },
];

/** One structured analyst read (the `emit_trade_analysis` tool input). */
export interface AnalystTake {
  overallBias: 'bullish' | 'bearish' | 'neutral';
  newsSummary: string;
  shortTerm: {
    verdict: 'BUY' | 'SELL' | 'HOLD';
    conviction: 'low' | 'medium' | 'high';
    horizon: string;
    thesis: string;
    keyDrivers: string[];
    risks: string[];
    entryZone: string;
    target: string;
    stop: string;
    invalidation: string;
  };
  longTerm: {
    verdict: 'BUY' | 'SELL' | 'HOLD';
    conviction: 'low' | 'medium' | 'high';
    horizon: string;
    thesis: string;
    keyDrivers: string[];
    risks: string[];
    keyLevels: string;
    invalidation: string;
  };
}

export interface GenerateResult {
  analysis: AnalystTake;
  cached: boolean;
  /** Live spot price at generation (or the cached take's price), if known. */
  price: number | null;
}

async function research(client: Anthropic, symbol: string, name: string): Promise<string> {
  try {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `Research the latest news, catalysts, upcoming events, and market sentiment for ${name} (${symbol}). Summarize the key points in 4-6 short bullets.` },
    ];
    const resp = await client.messages.create({ model: RESEARCH_MODEL, max_tokens: 500, system: RESEARCH_SYSTEM, tools: WEB_TOOLS, messages });
    return resp.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  } catch (e) {
    console.warn('AI analyst research step failed (continuing without news):', e);
    return '';
  }
}

/**
 * Serve a fresh cached analyst take for `symbol`, or generate + cache a new one.
 * Quota/auth are the CALLER's responsibility. Returns null only when the model
 * returns no structured output (a 502-class failure at the call site).
 *
 * The take is cached per coin and shared by every user, the Telegram bot and the
 * daily push, so it takes no caller-supplied input: everything in the prompt is
 * fetched server-side. Never add a client-controlled argument here.
 */
export async function generateAnalystTake(
  symbol: string,
  db: SupabaseClient,
): Promise<GenerateResult | null> {
  const sym = symbol.toUpperCase();

  // Cache check FIRST — return a fresh cached take without any Anthropic calls
  // or Binance context build. This is the main cost saver: repeated generations
  // for the same coin (any user/surface) reuse one paid analysis within the TTL.
  try {
    const { data: cached } = await db
      .from('analyst_takes')
      .select('analysis, created_at, price')
      .eq('symbol', sym)
      .maybeSingle();
    if (cached?.analysis && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
      // Early-invalidate if the price has moved sharply since the take was made.
      let fresh = true;
      if (cached.price != null && Number(cached.price) > 0) {
        try {
          const spot = await fetchSpotPrice(sym);
          if (spot != null) {
            const movePct = Math.abs((spot - Number(cached.price)) / Number(cached.price)) * 100;
            if (movePct > STALE_MOVE_PCT) fresh = false;
          }
        } catch {
          // Spot fetch failed (e.g. Binance 451 from this region) — fall back
          // to TTL-only freshness.
        }
      }
      if (fresh) {
        return { analysis: cached.analysis as AnalystTake, cached: true, price: cached.price != null ? Number(cached.price) : null };
      }
    }
  } catch (e) {
    console.warn('analyst cache read failed (continuing to generate):', e);
  }

  const client = new Anthropic();
  const name = getCoinName(sym);

  const [marketContext, newsResearch] = await Promise.all([
    buildMarketContext(sym),
    research(client, sym, name),
  ]);

  const userContent = JSON.stringify({ symbol: sym, name, marketContext, newsResearch }, null, 2);

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: [{ type: 'text', text: ANALYST_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [TRADE_TOOL],
    tool_choice: { type: 'tool', name: 'emit_trade_analysis' },
    messages: [{ role: 'user', content: `Analyze this coin and call emit_trade_analysis:\n\n${userContent}` }],
  });

  const block = resp.content.find(b => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') return null;

  const price = marketContext?.price ?? null;

  // Persist to the cache so subsequent requests for this coin are free until TTL.
  try {
    await db
      .from('analyst_takes')
      .upsert({ symbol: sym, analysis: block.input, price, created_at: new Date().toISOString() }, { onConflict: 'symbol' });
  } catch (e) {
    console.warn('analyst cache write failed (non-fatal):', e);
  }

  return { analysis: block.input as AnalystTake, cached: false, price };
}
