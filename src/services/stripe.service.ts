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

export interface CheckoutSessionData {
  priceId: string;
  userId: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}

class StripeService {
  // Create a checkout session
  async createCheckoutSession(data: CheckoutSessionData): Promise<string | null> {
    try {
      // The server derives the userId from this token, not from the body.
      const { supabase } = await import('@/lib/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Call your API endpoint to create session
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { sessionId } = await response.json();
      return sessionId;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      return null;
    }
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

  // Create subscription checkout
  async createSubscriptionCheckout(
    userId: string,
    userEmail: string,
    plan: 'pro' | 'enterprise'
  ): Promise<void> {
    try {
      // Price IDs should be configured in environment variables
      const priceId = plan === 'pro'
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_ENTERPRISE_PRICE_ID;

      if (!priceId) {
        throw new Error(`Price ID for ${plan} plan not configured`);
      }

      const sessionData: CheckoutSessionData = {
        priceId,
        userId,
        userEmail,
        successUrl: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/pricing`,
      };

      const sessionId = await this.createCheckoutSession(sessionData);
      if (!sessionId) {
        throw new Error('Failed to create checkout session');
      }

      await this.redirectToCheckout(sessionId);
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

  // Handle successful payment
  // The webhook handles the actual subscription activation in Firestore.
  // This method just waits briefly for the webhook to process, then resolves.
  async handlePaymentSuccess(sessionId: string): Promise<void> {
    // The Stripe webhook (/api/stripe/webhook) handles updating the user's
    // subscription status in Firestore. By the time the user reaches the
    // success page, the webhook should have already fired.
    // We just log the session for tracking purposes.
    console.log(`Payment success for session: ${sessionId}`);
  }

  // Subscribe to a plan
  async subscribeToPlan(planId: string, interval: 'monthly' | 'yearly'): Promise<void> {
    try {
      // Get current user from auth
      const { supabase } = await import('@/lib/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      await this.createSubscriptionCheckout(
        user.id,
        user.email || '',
        planId === 'pro_monthly' || planId === 'pro_yearly' ? 'pro' : 'enterprise'
      );
    } catch (error) {
      console.error('Error subscribing to plan:', error);
      throw error;
    }
  }
}

export const stripeService = new StripeService();