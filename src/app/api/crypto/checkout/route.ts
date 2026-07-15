import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SUBSCRIPTION_PLANS } from '@/types/subscription.types';

export const dynamic = 'force-dynamic';

const COMMERCE_API = 'https://api.commerce.coinbase.com/charges';

// Coinbase Commerce settles crypto to us (non-custodial — we never hold keys).
// Charges are ONE-TIME, so a crypto payment grants Pro for a fixed period
// (monthly/yearly); there's no auto-renew like the Stripe subscription.
export async function POST(request: NextRequest) {
  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ available: false, reason: 'not_configured' }, { status: 503 });
  }

  try {
    // Identity comes from the verified session, NEVER the body — the webhook
    // trusts metadata.userId to grant Pro, so it must be authentic.
    const header = request.headers.get('authorization');
    if (!header?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = createServiceClient();
    const { data: userData, error: userErr } = await db.auth.getUser(header.slice(7));
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = userData.user;

    const { billingInterval, redirectUrl, cancelUrl } = await request.json();
    const interval: 'monthly' | 'yearly' = billingInterval === 'yearly' ? 'yearly' : 'monthly';
    // Price is server-authoritative (never trust a client-supplied amount).
    const amount = SUBSCRIPTION_PLANS.pro.price[interval];

    const resp = await fetch(COMMERCE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': apiKey,
        'X-CC-Version': '2018-03-22',
      },
      body: JSON.stringify({
        name: 'CryptoSuccess Pro',
        description: `Pro subscription (${interval})`,
        pricing_type: 'fixed_price',
        local_price: { amount: amount.toFixed(2), currency: 'USD' },
        metadata: { userId: user.id, billingInterval: interval, plan: 'pro' },
        redirect_url: redirectUrl,
        cancel_url: cancelUrl,
      }),
    });

    if (!resp.ok) {
      console.error('Coinbase Commerce charge failed:', resp.status, await resp.text().catch(() => ''));
      return NextResponse.json({ available: false, reason: 'charge_failed' }, { status: 502 });
    }

    const json = await resp.json();
    const url = json?.data?.hosted_url;
    if (!url) {
      return NextResponse.json({ available: false, reason: 'no_url' }, { status: 502 });
    }
    return NextResponse.json({ url, code: json.data.code });
  } catch (error) {
    console.error('Crypto checkout error:', error);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }
}
