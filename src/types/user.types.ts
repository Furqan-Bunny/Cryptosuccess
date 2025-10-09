export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  subscription: UserSubscription;
  preferences: UserPreferences;
  metadata: UserMetadata;
}

export interface UserSubscription {
  status: 'free' | 'pro' | 'cancelled';
  planId?: string;
  customerId?: string;
  currentPeriodEnd?: Date;
  signalsUsedToday: number;
  lastResetDate: Date;
}

export interface UserPreferences {
  notifications: boolean;
  timezone: string;
  watchlist: string[];
  theme?: 'light' | 'dark' | 'system';
  emailAlerts?: boolean;
}

export interface UserMetadata {
  createdAt: Date;
  lastLogin: Date;
  totalSignalsViewed: number;
  favoriteCoins?: string[];
  signupSource?: string;
}