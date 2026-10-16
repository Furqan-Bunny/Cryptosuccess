import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { withCronMonitoring } from '@/lib/server/cron-monitor';
import { runEngineTick } from '@/services/engine/order-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Drives the paper-trading execution engine: fills conditional orders
// (limit / stop-loss / take-profit / trailing-stop) and liquidates futures
// positions. Designed to be called frequently (~every minute) by Vercel Cron
// (Pro plan) or any external scheduler holding CRON_SECRET. Idempotent.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }
  // Run is recorded in cron_runs; a throw is reported and answered with 500.
  return withCronMonitoring('engine-tick', async () => {
    const result = await runEngineTick();
    return NextResponse.json({ ok: true, ...result });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
