import { NextRequest, NextResponse } from 'next/server';
import { getUidFromToken } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Server proxy to the 0x Swap API (allowance-holder flow). Keeps the 0x API key
// server-side and gates quoting to signed-in users. The RETURNED transaction is
// unsigned — it is only ever signed by the user's own wallet in the browser.
const ZEROX_URL = process.env.ZEROX_API_URL || 'https://api.0x.org';

export async function GET(request: NextRequest) {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ available: false, reason: 'not_configured' }, { status: 503 });
  }

  const header = request.headers.get('authorization');
  const uid = header?.startsWith('Bearer ') ? await getUidFromToken(header.slice(7)) : null;
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const chainId = sp.get('chainId');
  const sellToken = sp.get('sellToken');
  const buyToken = sp.get('buyToken');
  const sellAmount = sp.get('sellAmount');
  const taker = sp.get('taker');
  if (!chainId || !sellToken || !buyToken || !sellAmount || !taker) {
    return NextResponse.json({ available: false, reason: 'bad_request' }, { status: 400 });
  }

  try {
    const url = new URL('/swap/allowance-holder/quote', ZEROX_URL);
    url.searchParams.set('chainId', chainId);
    url.searchParams.set('sellToken', sellToken);
    url.searchParams.set('buyToken', buyToken);
    url.searchParams.set('sellAmount', sellAmount);
    url.searchParams.set('taker', taker);

    const resp = await fetch(url, {
      headers: { '0x-api-key': apiKey, '0x-version': 'v2' },
      cache: 'no-store',
    });
    const data = await resp.json();
    if (!resp.ok) {
      return NextResponse.json({ available: false, reason: 'quote_failed', detail: data }, { status: 502 });
    }
    return NextResponse.json({ available: true, quote: data });
  } catch (error) {
    console.error('0x quote error:', error);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 502 });
  }
}
