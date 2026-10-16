import { loadStripe, Stripe } from '@stripe/stripe-js';

// Initialize Stripe
let stripePromise: Promise<Stripe | null>;
const getStripe = () => {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('Stripe publishable key not found');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// Only Pro is sellable: the profiles table stores free | pro | cancelled, so a
// "premium" / "enterprise" payment could never be granted.
export type SellablePlan = 'pro';
export type BillingInterval = 'monthly' | 'yearly';

export interface CheckoutSessionData {
  plan: SellablePlan;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  url?: string | null;
}

/** Thrown when the user picks a tier we don't sell. */
export class PlanNotAvailableError extends Error {
  constructor(planId: string) {
    super(`The ${planId.split('_')[0] || planId} plan is not available for purchase yet.`);
    this.name = 'PlanNotAvailableError';
  }
}

class StripeService {
  // Create a checkout session. The server picks the Stripe price from
  // {plan, interval} and derives the user from the access token — the body
  // carries no price id and no identity.
  async createCheckoutSession(data: CheckoutSessionData): Promise<CheckoutSession | null> {
    const { supabase } = await import('@/lib/supabase/client');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Please sign in to subscribe');

    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Surface a user-safe reason; the route only returns short fixed strings.
      if (response.status === 409) {
        throw new Error('You already have an active Pro subscription. Manage it from Settings.');
      }
      if (response.status === 400 || response.status === 503) {
        throw new Error('This plan is not available right now. Please try again later.');
      }
      if (response.status === 401) throw new Error('Please sign in to subscribe');
      throw new Error('Failed to start checkout. Please try again.');
    }

    const { sessionId, url } = await response.json();
    return sessionId ? { sessionId, url } : null;
  }

  // Redirect to Stripe Checkout
  async redirectToCheckout(sessionId: string): Promise<void> {
    const stripe = await getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    const { error } = await stripe.redirectToCheckout({ sessionId });

    if (error) {
      console.error('Stripe redirect error:', error);
      throw error;
    }
  }

  // Create subscription checkout for a sellable plan + billing interval.
  async createSubscriptionCheckout(plan: SellablePlan, interval: BillingInterval): Promise<void> {
    try {
      const sessionData: CheckoutSessionData = {
        plan,
        interval,
        successUrl: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/pricing`,
      };

      const checkout = await this.createCheckoutSession(sessionData);
      if (!checkout) {
        throw new Error('Failed to create checkout session');
      }

      // Prefer the hosted URL Stripe returns; fall back to Stripe.js.
      if (checkout.url) {
        window.location.href = checkout.url;
        return;
      }
      await this.redirectToCheckout(checkout.sessionId);
    } catch (error) {
      console.error('Error creating subscription checkout:', error);
      throw error;
    }
  }

  // Create customer portal session. The server derives the Stripe customer from
  // the authenticated session — we only send the access token + return URL.
  async createCustomerPortalSession(): Promise<string | null> {
    try {
      const { supabase } = await import('@/lib/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/stripe/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/dashboard`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      return null;
    }
  }

  // Redirect to customer portal
  async redirectToCustomerPortal(): Promise<void> {
    const portalUrl = await this.createCustomerPortalSession();
    if (portalUrl) {
      window.location.href = portalUrl;
    } else {
      throw new Error('Failed to create customer portal session');
    }
  }

  // Subscribe to a plan. `planId` is a SUBSCRIPTION_PLANS id ('pro_monthly', …);
  // the interval picks the Stripe price on the server. Anything but Pro throws
  // PlanNotAvailableError — premium / enterprise can't be stored or granted.
  async subscribeToPlan(planId: string, interval: BillingInterval): Promise<void> {
    try {
      if (planId !== 'pro' && planId !== 'pro_monthly' && planId !== 'pro_yearly') {
        throw new PlanNotAvailableError(planId);
      }
      if (interval !== 'monthly' && interval !== 'yearly') {
        throw new Error('Invalid billing interval');
      }

      const { supabase } = await import('@/lib/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      await this.createSubscriptionCheckout('pro', interval);
    } catch (error) {
      console.error('Error subscribing to plan:', error);
      throw error;
    }
  }
}

export const stripeService = new StripeService();