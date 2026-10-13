import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';

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

/**
 * Mint a one-time Telegram link code for the signed-in user. The user then sends
 * `/link <code>` to the bot to bind their Telegram id to this account.
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization');
  const uid = header?.startsWith('Bearer ') ? await getUidFromToken(header.slice(7)) : null;
  if (!uid) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  const db = createServiceClient();
  const code = makeCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  try {
    const { error } = await db
      .from('telegram_link_codes')
      .insert({ code, user_id: uid, expires_at: expiresAt });
    if (error) throw error;
  } catch (e) {
    console.error('mint telegram link code failed:', e);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code, expiresAt, expiresInSeconds: CODE_TTL_MS / 1000 });
}
