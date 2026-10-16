import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { rateLimit, clientIp } from '@/lib/server/rate-limit';
import { parseBoundedInt } from '@/lib/market-params';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rl = await rateLimit('sentiment', clientIp(request.headers), 60, 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }
  try {
    const limit = parseBoundedInt(request.nextUrl.searchParams.get('limit'), 1, 1, 365);
    if (limit === null) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }

    const response = await axios.get('https://api.alternative.me/fng/', {
      params: { limit, format: 'json' },
      timeout: 5000,
    });

    return NextResponse.json(response.data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('Fear & Greed API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sentiment data' },
      { status: 503 }
    );
  }
}
