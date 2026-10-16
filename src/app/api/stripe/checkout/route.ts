import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/server/report-error';
import { resolveStripePriceId } from '@/lib/subscription-rules';
import { sameOriginUrl, trustedAppOrigin } from '@/lib/safe-redirect';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
}

const DEFAULT_SUCCESS_PATH = '/subscription/success?session_id={CHECKOUT_SESSION_ID}';
const DEFAULT_CANCEL_PATH = '/pricing';

export async function POST(request: NextRequest) {
  try {
    // Identity comes from the verified session, NEVER the request body — the
    // webhook trusts metadata.userId / client_reference_id to grant Pro, so it
    // must be authentic.
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
    const plan = body?.plan;
    const interval = body?.interval;
    if (plan !== 'pro') {
      // The profiles table can only hold free | pro | cancelled, so no other tier
      // is sellable — refuse rather than take money for a plan we can't grant.
      return NextResponse.json({ error: 'Plan not available' }, { status: 400 });
    }
    if (interval !== 'monthly' && interval !== 'yearly') {
      return NextResponse.json({ error: 'Invalid billing interval' }, { status: 400 });
    }

    // Price is derived SERVER-SIDE from plan + interval; a client-supplied price
    // id is never accepted (it could point at a cheaper or $0 price).
    const priceId = resolveStripePriceId(plan, interval, process.env);
    if (!priceId) {
      await reportError('stripe.checkout', new Error(`Stripe price for pro/${interval} is not configured`), { route: '/api/stripe/checkout' });
      return NextResponse.json({ error: 'Plan not available' }, { status: 503 });
    }

    // Return URLs must stay on our own site (Stripe redirects the user there).
    // Anything else falls back to the default pages on the trusted origin.
    const origin = trustedAppOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
    const successUrl =
      sameOriginUrl(body?.successUrl, origin) ?? `${origin}${DEFAULT_SUCCESS_PATH}`;
    const cancelUrl = sameOriginUrl(body?.cancelUrl, origin) ?? `${origin}${DEFAULT_CANCEL_PATH}`;

    // Don't sell a second subscription to an active subscriber; send them to the
    // billing portal instead.
    const { data: profile } = await db
      .from('profiles')
      .select('subscription_status, plan_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.subscription_status === 'pro' && profile.plan_id && !String(profile.plan_id).startsWith('crypto_')) {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 409 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        userId: user.id,
        billingInterval: interval,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          billingInterval: interval,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    await reportError('stripe.checkout', error, { route: '/api/stripe/checkout' });
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
