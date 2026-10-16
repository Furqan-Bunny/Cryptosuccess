import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUidFromToken, createServiceClient } from '@/lib/supabase/server';
import { sameOriginUrl, trustedAppOrigin } from '@/lib/safe-redirect';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-09-30.clover',
  });
}

async function getUid(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return getUidFromToken(header.slice(7));
}

export async function POST(request: NextRequest) {
  try {
    // Auth gate: derive identity from the verified session, never from the body.
    // (Trusting a client-supplied customerId was an IDOR — anyone with a cus_…
    // could open another customer's billing portal.)
    const uid = await getUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { returnUrl } = await request.json().catch(() => ({}));

    // Look up THIS user's own Stripe customer id (service-role bypasses RLS).
    const db = createServiceClient();
    const { data: profile } = await db
      .from('profiles')
      .select('customer_id')
      .eq('id', uid)
      .maybeSingle();

    const customerId = profile?.customer_id;
    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing account found for this user' },
        { status: 400 }
      );
    }

    // Stripe sends the user back to return_url — only our own site is allowed.
    const origin = trustedAppOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
    const safeReturnUrl = sameOriginUrl(returnUrl, origin) ?? `${origin}/dashboard`;

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: safeReturnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe billing portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    );
  }
}
