export type SubscriptionStatus = 'free' | 'pro' | 'premium' | 'enterprise';
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
    signalsPerDay?: number;
    portfolioAssets?: number;
    advancedAnalysis: boolean;
    realTimeAlerts: boolean;
    portfolioTracking: boolean;
    tradeExecution: boolean;
    prioritySupport: boolean;
    apiAccess: boolean;
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
      '5 AI signals per day',
      'Basic technical analysis',
      'Market overview',
      'Email support',
      'Community access',
    ],
    limits: {
      signalsPerDay: 5,
      advancedAnalysis: false,
      realTimeAlerts: false,
      portfolioTracking: false,
      tradeExecution: false,
      prioritySupport: false,
      apiAccess: false,
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
      'Unlimited AI signals',
      'Advanced technical analysis',
      'Real-time price alerts',
      'Portfolio tracking',
      'Trade execution',
      'Priority support',
      'Export data to CSV',
    ],
    limits: {
      signalsPerDay: undefined, // unlimited
      portfolioAssets: 20,
      advancedAnalysis: true,
      realTimeAlerts: true,
      portfolioTracking: true,
      tradeExecution: true,
      prioritySupport: true,
      apiAccess: false,
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
    features: [
      'Everything in Pro',
      'Advanced AI predictions',
      'Custom trading strategies',
      'Unlimited portfolio assets',
      'API access',
      'White-glove support',
      'Early access to features',
    ],
    limits: {
      signalsPerDay: undefined, // unlimited
      portfolioAssets: undefined, // unlimited
      advancedAnalysis: true,
      realTimeAlerts: true,
      portfolioTracking: true,
      tradeExecution: true,
      prioritySupport: true,
      apiAccess: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    type: 'enterprise',
    price: {
      monthly: 0, // Custom pricing
      yearly: 0,
    },
    features: [
      'Everything in Premium',
      'Custom integrations',
      'Dedicated account manager',
      'Custom AI models',
      'SLA guarantee',
      'On-premise deployment',
    ],
    limits: {
      signalsPerDay: undefined,
      portfolioAssets: undefined,
      advancedAnalysis: true,
      realTimeAlerts: true,
      portfolioTracking: true,
      tradeExecution: true,
      prioritySupport: true,
      apiAccess: true,
    },
  },
};