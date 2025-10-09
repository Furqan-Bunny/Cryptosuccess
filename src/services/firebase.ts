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

// Lazy initialization
let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let functionsInstance: Functions | null = null;

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

// Lazy getters
export function getAuthInstance(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getApp());
  }
  return authInstance;
}

export function getDbInstance(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getApp());
  }
  return dbInstance;
}

export function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getApp());
  }
  return functionsInstance;
}

// Analytics (only in browser and if supported)
export const analytics = typeof window !== 'undefined'
  ? isSupported().then(yes => yes ? getAnalytics(getApp()) : null)
  : Promise.resolve(null);

// Export lazy instances as named exports to maintain compatibility
export const auth = new Proxy({} as Auth, {
  get: (target, prop) => {
    const authInstance = getAuthInstance();
    return authInstance[prop as keyof Auth];
  }
});

export const db = new Proxy({} as Firestore, {
  get: (target, prop) => {
    const dbInstance = getDbInstance();
    return dbInstance[prop as keyof Firestore];
  }
});

export const functions = new Proxy({} as Functions, {
  get: (target, prop) => {
    const functionsInstance = getFunctionsInstance();
    return functionsInstance[prop as keyof Functions];
  }
});

export default getApp;
