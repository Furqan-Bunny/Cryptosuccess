// Plan catalogue shown on /pricing and the landing page. Only Free and Pro exist
// in the account system (profiles.subscription_status is free | pro | cancelled);
// Premium is displayed as "Coming soon" and cannot be bought. Every feature line
// here must describe something the app actually does today.
export type SubscriptionStatus = 'free' | 'pro' | 'premium';
export type BillingInterval = 'monthly' | 'yearly';

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: SubscriptionStatus;
  price: {
    monthly: number;
    yearly: number;
  };
  features: string[];
  limits: {
    /** Signals per UTC day across web + Telegram; undefined = unlimited. */
    signalsPerDay?: number;
    /** Coins on the watchlist (mirrors src/lib/watchlist.ts). */
    watchlistCoins?: number;
    /** Simulated spot / futures / staking / DCA trading and the paper portfolio. */
    paperTrading: boolean;
    /** New-listing / opportunity scanner (/discover). */
    opportunityScanner: boolean;
    /** Daily Telegram alerts for the user's coins (linked Pro accounts only). */
    telegramAlerts: boolean;
  };
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionStatus, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    type: 'free',
    price: {
      monthly: 0,
      yearly: 0,
    },
    features: [
      '5 signals per day (web and Telegram combined)',
      'Technical analysis on 50 coins',
      'Market overview',
      'Watchlist of up to 5 coins',
      'Public, verifiable track record',
    ],
    limits: {
      signalsPerDay: 5,
      watchlistCoins: 5,
      paperTrading: false,
      opportunityScanner: false,
      telegramAlerts: false,
    },
  },
  pro: {
    id: 'pro_monthly',
    name: 'Pro',
    type: 'pro',
    price: {
      monthly: 19,
      yearly: 182, // 20% discount
    },
    features: [
      'Unlimited signals',
      'Watchlist of up to 50 coins',
      'Paper-trading suite: spot, futures, staking and DCA (simulated funds)',
      'Portfolio tracker (log your own trades)',
      'Opportunity scanner',
      'Unlimited signals in Telegram (link your account)',
      'Optional daily Telegram alerts for your coins',
    ],
    limits: {
      signalsPerDay: undefined, // unlimited
      watchlistCoins: 50,
      paperTrading: true,
      opportunityScanner: true,
      telegramAlerts: true,
    },
  },
  premium: {
    id: 'premium_monthly',
    name: 'Premium',
    type: 'premium',
    price: {
      monthly: 49,
      yearly: 470, // 20% discount
    },
    // Not purchasable yet (shown as "Coming soon"); nothing here is promised.
    features: [
      'Everything in Pro',
      'Further features to be announced',
    ],
    limits: {
      signalsPerDay: undefined,
      watchlistCoins: 50,
      paperTrading: true,
      opportunityScanner: true,
      telegramAlerts: true,
    },
  },
};
