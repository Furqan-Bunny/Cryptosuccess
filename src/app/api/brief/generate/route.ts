import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { withCronMonitoring } from '@/lib/server/cron-monitor';
import { reportError } from '@/lib/server/report-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // research can take a while; capped to the Vercel plan limit

const MODEL = 'claude-sonnet-4-6';

const SYSTEM = `You are a crypto market analyst writing a concise daily brief for retail traders. Use web search for the latest information. Be factual, balanced, and calibrated — no hype, no guarantees, no price predictions stated as fact. This is market commentary, not financial advice.`;

const PROMPT = `Write today's crypto market brief in Markdown. Structure:
## Market Overview
2-3 sentences on overall direction, total-market sentiment (e.g. Fear & Greed), and any macro driver.
## Coins
For each of BTC, ETH, SOL, BNB: a short paragraph with notable recent news/catalysts, the current trend, and one key level or thing to watch.
## What to Watch
3-4 bullets on upcoming events or risks.
End with a one-line reminder that this is not financial advice. Keep it tight (~400-500 words).`;

const WEB_TOOLS: any[] = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 4 },
];

async function handler(request: NextRequest) {
  // Shared cron gate: constant-time compare, fails CLOSED in production when
  // CRON_SECRET is unset (this route spends Anthropic credit on every call).
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 500 });
  }

  // The monitor records the run; a 5xx below counts as a failed run and alerts.
  return withCronMonitoring('brief-generate', () => generateBrief());
}

async function generateBrief() {
  try {
    const client = new Anthropic();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: PROMPT }];
    let resp = await client.messages.create({ model: MODEL, max_tokens: 2000, system: SYSTEM, tools: WEB_TOOLS, messages });
    let guard = 0;
    while (resp.stop_reason === 'pause_turn' && guard++ < 2) {
      messages.push({ role: 'assistant', content: resp.content });
      resp = await client.messages.create({ model: MODEL, max_tokens: 2000, system: SYSTEM, tools: WEB_TOOLS, messages });
    }

    const markdown = resp.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    if (!markdown) return NextResponse.json({ ok: false, reason: 'empty' }, { status: 502 });

    const date = new Date().toISOString().slice(0, 10);
    const { error: saveErr } = await createServiceClient()
      .from('briefs')
      .upsert({ date, markdown }, { onConflict: 'date' });
    if (saveErr) throw new Error(`brief save failed: ${saveErr.message}`);

    return NextResponse.json({ ok: true, date });
  } catch (error) {
    // Detail goes to the log / error_events; the monitor sends the one alert.
    await reportError('cron.brief-generate.detail', error, {
      route: '/api/brief/generate',
      level: 'warn',
      alert: false,
      ...(error instanceof Anthropic.APIError ? { apiStatus: error.status } : {}),
    });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return handler(request); }
export async function POST(request: NextRequest) { return handler(request); }
