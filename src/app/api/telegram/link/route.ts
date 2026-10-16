import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/server/report-error';
import { rateLimit } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Unambiguous alphabet (no 0/O/1/I) → easy to read and type into Telegram.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? getUidFromToken(header.slice(7)) : null;
}

/**
 * Whether the signed-in user's account is linked to a Telegram chat. Only a
 * yes/no leaves the server (never the chat id or username).
 */
export async function GET(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const db = createServiceClient();
  const { count, error } = await db
    .from('telegram_users')
    .select('telegram_id', { count: 'exact', head: true })
    .eq('user_id', uid);
  if (error) {
    await reportError('telegram.link.status', error, { route: '/api/telegram/link' });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, linked: (count ?? 0) > 0 });
}

/**
 * Mint a one-time Telegram link code for the signed-in user. The user then sends
 * `/link <code>` to the bot to bind their Telegram id to this account. An
 * account is linked to one chat at a time: redeeming a code moves the link to
 * the redeeming chat (redeem_telegram_link, migration 0014).
 */
export async function POST(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  // Per-user cap: every call writes a row, so unbounded minting would grow the
  // table on a service-role write path.
  const rl = await rateLimit('telegram-link', uid, 5, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const db = createServiceClient();
  const code = makeCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  try {
    // One live code per account: a new code replaces any unused one, so the
    // table holds at most one pending row per user (used rows are kept by the
    // linking flow and pruned daily by /api/ops/prune).
    const { error: delErr } = await db
      .from('telegram_link_codes')
      .delete()
      .eq('user_id', uid)
      .is('used_at', null);
    if (delErr) throw delErr;

    const { error } = await db
      .from('telegram_link_codes')
      .insert({ code, user_id: uid, expires_at: expiresAt });
    if (error) throw error;
  } catch (e) {
    await reportError('telegram.link', e, { route: '/api/telegram/link' });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code, expiresAt, expiresInSeconds: CODE_TTL_MS / 1000 });
}

/**
 * Unlink every Telegram chat from the signed-in user's account (and drop any
 * unused code). The chat falls back to its own free allowance and stops
 * receiving the account's alerts and follow-ups.
 */
export async function DELETE(request: NextRequest) {
  const uid = await getUid(request);
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit('telegram-unlink', uid, 5, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, reason: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc('unlink_telegram_account', { p_user_id: uid });
  if (error) {
    await reportError('telegram.unlink', error, { route: '/api/telegram/link' });
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, unlinked: Number(data) || 0 });
}
