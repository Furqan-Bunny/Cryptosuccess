import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily retention for the ops tables (migration 0011): deletes error_events and
// cron_runs older than 30 days plus stale alert-throttle rows. The window is
// fixed server-side — callers cannot pass it.
async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  return withCronMonitoring('ops-prune', async () => {
    const db = createServiceClient();
    const { data, error } = await db.rpc('prune_ops_events', { p_retention_days: 30 });
    if (error) throw new Error(error.message);
    const deleted = (data ?? {}) as { errorEvents?: number; cronRuns?: number; alertThrottle?: number };
    return NextResponse.json({
      ok: true,
      errorEvents: Number(deleted.errorEvents ?? 0),
      cronRuns: Number(deleted.cronRuns ?? 0),
      alertThrottle: Number(deleted.alertThrottle ?? 0),
    });
  });
}

export async function GET(request: NextRequest) {
  return handler(request);
}
export async function POST(request: NextRequest) {
  return handler(request);
}
