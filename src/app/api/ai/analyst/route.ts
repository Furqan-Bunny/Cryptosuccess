import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildMarketContext } from '@/services/market-context.service';
import { getCoinName } from '@/lib/coins';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // web search + multi-step reasoning needs headroom

const MODEL = 'claude-sonnet-4-6';

const RESEARCH_SYSTEM = `You are a crypto research assistant. Use web search to find the most recent news, catalysts, regulatory developments, and market sentiment for the given coin. Be concise and strictly factual — never invent sources or events. If little is found, say so plainly.`;

const ANALYST_SYSTEM = `You are a seasoned cryptocurrency trading analyst. You are given a coin's behavior across multiple timeframes (1h/4h/1d/1w: trend, regime, volatility, momentum, position-in-range, key levels), a short-term quantitative signal, and a live news summary. Reason over ALL of it like a disciplined human trader and return TWO reads via the emit_trade_analysis tool: a short-term read (days) and a long-term read (weeks to months).

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

const WEB_TOOLS: any[] = [
  { type: 'web_search_20260209', name: 'web_search' },
  { type: 'web_fetch_20260209', name: 'web_fetch' },
];

async function research(client: Anthropic, symbol: string, name: string): Promise<string> {
  try {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: `Research the latest news, catalysts, upcoming events, and market sentiment for ${name} (${symbol}). Summarize the key points in 4-6 short bullets.` },
    ];
    let resp = await client.messages.create({ model: MODEL, max_tokens: 1200, system: RESEARCH_SYSTEM, tools: WEB_TOOLS, messages });
    let guard = 0;
    while (resp.stop_reason === 'pause_turn' && guard++ < 3) {
      messages.push({ role: 'assistant', content: resp.content });
      resp = await client.messages.create({ model: MODEL, max_tokens: 1200, system: RESEARCH_SYSTEM, tools: WEB_TOOLS, messages });
    }
    return resp.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  } catch (e) {
    console.warn('AI analyst research step failed (continuing without news):', e);
    return '';
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ available: false, reason: 'not_configured' });
  }

  try {
    const { symbol, signal } = await request.json();
    if (!symbol) return NextResponse.json({ available: false, reason: 'bad_request' }, { status: 400 });

    const client = new Anthropic();
    const name = getCoinName(symbol);

    const [marketContext, newsResearch] = await Promise.all([
      buildMarketContext(symbol),
      research(client, symbol, name),
    ]);

    const userContent = JSON.stringify({ symbol, name, quantSignal: signal, marketContext, newsResearch }, null, 2);

    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: [{ type: 'text', text: ANALYST_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [TRADE_TOOL],
      tool_choice: { type: 'tool', name: 'emit_trade_analysis' },
      messages: [{ role: 'user', content: `Analyze this coin and call emit_trade_analysis:\n\n${userContent}` }],
    });

    const block = resp.content.find(b => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return NextResponse.json({ available: false, reason: 'no_output' }, { status: 502 });
    }
    return NextResponse.json({ available: true, analysis: block.input });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`AI analyst API error ${error.status}:`, error.message);
    } else {
      console.error('AI analyst error:', error);
    }
    return NextResponse.json({ available: false, reason: 'error' }, { status: 502 });
  }
}
