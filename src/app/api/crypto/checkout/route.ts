import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { expectedCryptoPriceUsd, isCryptoPlan } from '@/lib/subscription-rules';
import { sameOriginUrl, trustedAppOrigin } from '@/lib/safe-redirect';

export const dynamic = 'force-dynamic';

// NOWPayments hosted invoice. Non-custodial: settles to our configured wallet, no
// keys held here. Invoices are ONE-TIME, so a crypto payment grants Pro for a
// fixed period (monthly/yearly); there is no auto-renew like the Stripe subscription.
// Set NOWPAYMENTS_API_URL=https://api-sandbox.nowpayments.io/v1 to use the sandbox.
const API = process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1';

export async function POST(request: NextRequest) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ available: false, reason: 'not_configured' }, { status: 503 });
  }

  try {
    // Identity comes from the verified session, NEVER the body — the webhook
    // trusts order_id (userId:interval) to grant Pro, so it must be authentic.
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

    const body = await request.json().catch(() => null);
    const interval: 'monthly' | 'yearly' = body?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
    // Price is server-authoritative (never trust a client-supplied amount). The
    // IPN webhook re-checks the paid invoice against this same figure.
    const amount = expectedCryptoPriceUsd(interval);

    // An active card subscriber would be paying twice — point them at billing
    // instead. A crypto Pro may pay again: the webhook extends their period.
    const { data: profile } = await db
      .from('profiles')
      .select('subscription_status, plan_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.subscription_status === 'pro' && profile.plan_id && !isCryptoPlan(profile.plan_id)) {
      return NextResponse.json({ available: false, reason: 'already_subscribed' }, { status: 409 });
    }

    // Public base URL for the IPN callback (must be reachable by NOWPayments),
    // and the only origin the hosted invoice may send the user back to.
    const appUrl = trustedAppOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
    const redirectUrl = sameOriginUrl(body?.redirectUrl, appUrl) ?? `${appUrl}/subscription/success`;
    const cancelUrl = sameOriginUrl(body?.cancelUrl, appUrl) ?? `${appUrl}/pricing`;

    const resp = await fetch(`${API}/invoice`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        // uuid contains no ':' so this splits cleanly in the webhook.
        order_id: `${user.id}:${interval}`,
        order_description: `CryptoSuccess Pro (${interval})`,
        ipn_callback_url: `${appUrl}/api/crypto/webhook`,
        success_url: redirectUrl,
        cancel_url: cancelUrl,
      }),
    });

    if (!resp.ok) {
      console.error('NOWPayments invoice failed:', resp.status, await resp.text().catch(() => ''));
      return NextResponse.json({ available: false, reason: 'invoice_failed' }, { status: 502 });
    }

    const json = await resp.json();
    const url = json?.invoice_url;
    if (!url) {
      return NextResponse.json({ available: false, reason: 'no_url' }, { status: 502 });
    }
    return NextResponse.json({ url, id: json.id });
  } catch (error) {
    console.error('Crypto checkout error:', error);
    return NextResponse.json({ available: false, reason: 'error' }, { status: 500 });
  }
}
