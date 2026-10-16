import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Public liveness probe for uptime monitors. Deliberately minimal: it touches no
// database or third party and reveals nothing about the deployment (no version,
// env, dependency or cron state). Detailed health lives behind CRON_SECRET at
// /api/ops/status.
export async function GET() {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
