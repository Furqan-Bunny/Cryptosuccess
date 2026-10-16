import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { withCronMonitoring } from '@/lib/server/cron-monitor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily retention for the ops tables (migration 0011): deletes error_events and
// cron_runs older than 30 days plus stale alert-throttle rows. The window is
// fixed server-side — callers cannot pass it. Also drops Telegram link codes
// that expired more than a day ago (a code is single-use and lives 15 minutes).
const LINK_CODE_GRACE_MS = 24 * 60 * 60 * 1000;

async function handler(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  return withCronMonitoring('ops-prune', async () => {
    const db = createServiceClient();
    const { data, error } = await db.rpc('prune_ops_events', { p_retention_days: 30 });
    if (error) throw new Error(error.message);
    const deleted = (data ?? {}) as { errorEvents?: number; cronRuns?: number; alertThrottle?: number };

    const { count: linkCodes, error: codesErr } = await db
      .from('telegram_link_codes')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date(Date.now() - LINK_CODE_GRACE_MS).toISOString());
    if (codesErr) throw new Error(codesErr.message);

    return NextResponse.json({
      ok: true,
      linkCodes: linkCodes ?? 0,
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
