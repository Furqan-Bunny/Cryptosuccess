import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/server';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
}

// Only allow checkout for price ids we actually sell — stops a client from
// attaching an arbitrary (e.g. $0) price. Skipped only if no price ids are
// configured (local dev), never in a properly-configured deployment.
function allowedPriceIds(): string[] {
  return [
    process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID,
  ].filter(Boolean) as string[];
}

export async function POST(request: NextRequest) {
  try {
    // Identity comes from the verified session, NEVER the request body — the
    // webhook trusts metadata.userId to grant Pro, so it must be authentic.
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

    const { priceId, successUrl, cancelUrl, billingInterval } = await request.json();
    if (!priceId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const allowed = allowedPriceIds();
    if (allowed.length > 0 && !allowed.includes(priceId)) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email ?? undefined,
      metadata: {
        userId: user.id,
        billingInterval,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          billingInterval,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
