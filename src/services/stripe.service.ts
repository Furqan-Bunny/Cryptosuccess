import { loadStripe, Stripe } from '@stripe/stripe-js';
import { db } from './firebase';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';

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
      // Call your API endpoint to create session
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

  // Update user subscription status
  async updateSubscriptionStatus(
    userId: string,
    status: 'free' | 'pro' | 'enterprise',
    subscriptionId?: string,
    customerId?: string
  ): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);

      await updateDoc(userRef, {
        subscription: {
          status,
          subscriptionId: subscriptionId || null,
          customerId: customerId || null,
          updatedAt: new Date(),
        },
      });

      // Log subscription change
      await addDoc(collection(db, 'subscription_logs'), {
        userId,
        status,
        subscriptionId,
        customerId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Error updating subscription status:', error);
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscriptionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  // Get subscription details
  async getSubscriptionDetails(subscriptionId: string): Promise<any> {
    try {
      const response = await fetch(`/api/stripe/subscription/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get subscription details');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting subscription details:', error);
      throw error;
    }
  }

  // Create customer portal session
  async createCustomerPortalSession(customerId: string): Promise<string | null> {
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
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
  async redirectToCustomerPortal(customerId: string): Promise<void> {
    const portalUrl = await this.createCustomerPortalSession(customerId);
    if (portalUrl) {
      window.location.href = portalUrl;
    } else {
      throw new Error('Failed to create customer portal session');
    }
  }

  // Verify webhook signature (for server-side use)
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): any {
    // This would be implemented on the server side
    // Using Stripe's webhook verification
    throw new Error('Webhook verification must be done server-side');
  }

  // Handle successful payment
  async handlePaymentSuccess(sessionId: string): Promise<void> {
    try {
      // This would typically be called from your success page
      // after Stripe redirects back to your site
      const response = await fetch('/api/stripe/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to verify payment session');
      }

      const { subscription, customerId, userId } = await response.json();

      // Update user's subscription status
      await this.updateSubscriptionStatus(
        userId,
        'pro', // or determine from subscription
        subscription.id,
        customerId
      );
    } catch (error) {
      console.error('Error handling payment success:', error);
      throw error;
    }
  }

  // Subscribe to a plan
  async subscribeToPlan(planId: string, interval: 'monthly' | 'yearly'): Promise<void> {
    try {
      // Get current user from auth
      const { auth } = await import('./firebase');
      const user = auth.currentUser;

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create test price IDs (in production, these would be real Stripe price IDs)
      const testPriceId = interval === 'monthly'
        ? 'price_1QMqb8BEXI6qcoMdJJvZvxqQ' // You'll need to create these in Stripe Dashboard
        : 'price_1QMqb8BEXI6qcoMdpnE3Vv2j';

      await this.createSubscriptionCheckout(
        user.uid,
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