import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  try {
    // Create user profile document
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      subscription: {
        status: 'free',
        signalsUsedToday: 0,
        lastResetDate: admin.firestore.FieldValue.serverTimestamp(),
      },
      preferences: {
        notifications: true,
        timezone: 'UTC',
        watchlist: ['ETH', 'SOL', 'BNB'],
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        totalSignalsViewed: 0,
      },
    });

    console.log(`User profile created for ${user.uid}`);
  } catch (error) {
    console.error('Error creating user profile:', error);
  }
});