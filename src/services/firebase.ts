import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Functions, getFunctions } from 'firebase/functions';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization - only initialize when first accessed
let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let functionsInstance: Functions | undefined;

function getApp(): FirebaseApp {
  if (!app) {
    // Check if Firebase is already initialized
    const apps = getApps();
    if (apps.length > 0) {
      app = apps[0];
    } else {
      app = initializeApp(firebaseConfig);
    }
  }
  return app;
}

function initializeAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
  }
  return authInstance;
}

function initializeDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getApp());
  }
  return dbInstance;
}

function initializeFunctions(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getApp());
  }
  return functionsInstance;
}

// Export direct instances (will be initialized on first access in browser)
export const auth = typeof window !== 'undefined' ? initializeAuth() : ({} as Auth);
export const db = typeof window !== 'undefined' ? initializeDb() : ({} as Firestore);
export const functions = typeof window !== 'undefined' ? initializeFunctions() : ({} as Functions);

// Analytics (only in browser and if supported)
export const analytics = typeof window !== 'undefined'
  ? isSupported().then(yes => yes ? getAnalytics(getApp()) : null)
  : Promise.resolve(null);

// Export helper functions for SSR compatibility
export { initializeAuth as getAuthInstance, initializeDb as getDbInstance, initializeFunctions as getFunctionsInstance };

export default getApp;
