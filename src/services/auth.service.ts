import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  User,
  sendEmailVerification,
  AuthError,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// Types
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  subscription: {
    status: 'free' | 'pro' | 'cancelled';
    planId?: string;
    customerId?: string;
    currentPeriodEnd?: Date;
    signalsUsedToday: number;
    lastResetDate: Date;
  };
  preferences: {
    notifications: boolean;
    timezone: string;
    watchlist: string[];
  };
  metadata: {
    createdAt: Date;
    lastLogin: Date;
    totalSignalsViewed: number;
  };
}

class AuthService {
  private googleProvider: GoogleAuthProvider;

  constructor() {
    this.googleProvider = new GoogleAuthProvider();
    this.googleProvider.setCustomParameters({
      prompt: 'select_account',
    });
  }

  // Sign up with email and password
  async signUp(email: string, password: string, displayName?: string): Promise<User> {
    try {
      console.log('[AuthService] Attempting signup with:', { email, hasPassword: !!password, displayName });

      // Create user account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log('[AuthService] User created successfully:', user.uid);

      // Update display name if provided
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // Send email verification
      await sendEmailVerification(user);

      // Create user profile in Firestore
      await this.createUserProfile(user);

      return user;
    } catch (error) {
      const authError = error as AuthError;
      console.error('[AuthService] Signup error:', {
        code: authError.code,
        message: authError.message,
        fullError: authError,
      });
      throw this.handleAuthError(authError);
    }
  }

  // Sign in with email and password
  async signIn(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update last login
      await this.updateLastLogin(user.uid);

      return user;
    } catch (error) {
      throw this.handleAuthError(error as AuthError);
    }
  }

  // Sign in with Google
  async signInWithGoogle(): Promise<User> {
    try {
      const result = await signInWithPopup(auth, this.googleProvider);
      const user = result.user;

      // Check if user profile exists, create if not
      const userProfile = await this.getUserProfile(user.uid);
      if (!userProfile) {
        await this.createUserProfile(user);
      } else {
        await this.updateLastLogin(user.uid);
      }

      return user;
    } catch (error) {
      throw this.handleAuthError(error as AuthError);
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error) {
      throw this.handleAuthError(error as AuthError);
    }
  }

  // Send password reset email
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
      });
    } catch (error) {
      throw this.handleAuthError(error as AuthError);
    }
  }

  // Create user profile in Firestore
  private async createUserProfile(user: User): Promise<void> {
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || undefined,
      photoURL: user.photoURL || undefined,
      subscription: {
        status: 'free',
        signalsUsedToday: 0,
        lastResetDate: new Date(),
      },
      preferences: {
        notifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        watchlist: ['ETH', 'SOL', 'BNB'],
      },
      metadata: {
        createdAt: new Date(),
        lastLogin: new Date(),
        totalSignalsViewed: 0,
      },
    };

    await setDoc(doc(db, 'users', user.uid), {
      ...userProfile,
      metadata: {
        ...userProfile.metadata,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      },
    });
  }

  // Get user profile from Firestore
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  }

  // Update last login timestamp
  private async updateLastLogin(uid: string): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        metadata: {
          lastLogin: serverTimestamp(),
        },
      },
      { merge: true }
    );
  }

  // Handle authentication errors
  private handleAuthError(error: AuthError): Error {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Please contact support.',
      'auth/weak-password': 'Password must be at least 6 characters long.',
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.',
      'auth/cancelled-popup-request': 'Another sign-in popup is already open.',
      'auth/popup-blocked': 'Sign-in popup was blocked by your browser.',
      'auth/invalid-api-key': 'Firebase configuration error. Please contact support.',
      'auth/app-deleted': 'Firebase app has been deleted. Please contact support.',
      'auth/app-not-authorized': 'This app is not authorized to use Firebase Authentication.',
      'auth/argument-error': 'Invalid authentication request.',
      'auth/invalid-user-token': 'Your session has expired. Please sign in again.',
      'auth/user-token-expired': 'Your session has expired. Please sign in again.',
    };

    const message = errorMessages[error.code] || `Authentication error: ${error.code}. ${error.message}`;
    return new Error(message);
  }

  // Check if user is subscribed to pro plan
  async isProUser(uid: string): Promise<boolean> {
    const profile = await this.getUserProfile(uid);
    return profile?.subscription.status === 'pro';
  }

  // Check daily signal limit for free users
  async checkSignalLimit(uid: string): Promise<{ allowed: boolean; remaining: number }> {
    const profile = await this.getUserProfile(uid);
    if (!profile) {
      return { allowed: false, remaining: 0 };
    }

    // Pro users have unlimited signals
    if (profile.subscription?.status === 'pro') {
      return { allowed: true, remaining: -1 };
    }

    // Check if we need to reset the daily counter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastReset = profile.subscription?.lastResetDate
      ? new Date(profile.subscription.lastResetDate)
      : new Date(0);
    lastReset.setHours(0, 0, 0, 0);

    if (today > lastReset) {
      // Reset the counter
      await setDoc(
        doc(db, 'users', uid),
        {
          subscription: {
            signalsUsedToday: 0,
            lastResetDate: serverTimestamp(),
          },
        },
        { merge: true }
      );
      return { allowed: true, remaining: 5 };
    }

    // Check current usage
    const signalsUsedToday = profile.subscription?.signalsUsedToday || 0;
    const remaining = 5 - signalsUsedToday;
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  }

  // Increment signal usage counter
  async incrementSignalUsage(uid: string): Promise<void> {
    const userRef = doc(db, 'users', uid);
    const profile = await this.getUserProfile(uid);

    if (profile && (!profile.subscription?.status || profile.subscription.status === 'free')) {
      const currentSignalsUsedToday = profile.subscription?.signalsUsedToday || 0;
      const currentTotalSignalsViewed = profile.metadata?.totalSignalsViewed || 0;

      await setDoc(
        userRef,
        {
          subscription: {
            signalsUsedToday: currentSignalsUsedToday + 1,
          },
          metadata: {
            totalSignalsViewed: currentTotalSignalsViewed + 1,
          },
        },
        { merge: true }
      );
    }
  }
}

export const authService = new AuthService();