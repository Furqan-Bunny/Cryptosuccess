import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchSpotPrices } from '@/lib/server/binance-server';
import { isTelegramConfigured, sendMessage } from '@/lib/telegram/api';
import { isAnalystConfigured, isSupabaseConfigured, resolveBaseUrl } from '@/lib/telegram/env';
import { generateAnalystTake } from '@/services/analyst.service';
import { runPushJob } from '@/services/telegram/push-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Budget inside maxDuration: stop starting new chats at 35s and new (uncached)
// analyst generations at 40s, leaving headroom for one in-flight generation +
// send before the platform kills the function. Unserved chats go next run.
const START_BUDGET_MS = 35_000;
const GENERATE_BUDGET_MS = 40_000;
const DELAY_BETWEEN_CHATS_MS = 120;

// Scheduled "daily alerts" (cron; suggested cadence: daily). Pushes one honest
// digest to each opted-in chat linked to a Pro account, at most once per 20h.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  if (!isTelegramConfigured() || !isSupabaseConfigured() || !isAnalystConfigured()) {
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  const started = Date.now();
  try {
    const db = createServiceClient();
    const result = await runPushJob({
      db,
      send: (chatId, text) => sendMessage(chatId, text),
      analyst: symbol => generateAnalystTake(symbol, db),
      spotPrices: fetchSpotPrices,
      verifyUrl: `${resolveBaseUrl(request.headers)}/verify`,
      startDeadline: started + START_BUDGET_MS,
      generateDeadline: started + GENERATE_BUDGET_MS,
      delayMs: DELAY_BETWEEN_CHATS_MS,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('telegram push error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
