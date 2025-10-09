import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Firestore instance
const db = admin.firestore();

// Create user profile when a new user signs up
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
  const { uid, email, displayName, photoURL } = user;

  try {
    // Create user profile document
    await db.collection('users').doc(uid).set({
      uid,
      email,
      displayName: displayName || null,
      photoURL: photoURL || null,
      subscription: {
        status: 'free',
        signalsUsedToday: 0,
        lastResetDate: admin.firestore.FieldValue.serverTimestamp(),
      },
      preferences: {
        notifications: true,
        timezone: 'America/New_York',
        watchlist: ['ETH', 'SOL', 'BNB'],
      },
      metadata: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        totalSignalsViewed: 0,
      },
    });

    console.log(`Created profile for user: ${uid}`);
  } catch (error) {
    console.error('Error creating user profile:', error);
  }
});

// Delete user data when account is deleted
export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
  const { uid } = user;

  try {
    // Delete user profile
    await db.collection('users').doc(uid).delete();

    // Delete user's signals
    const signalsSnapshot = await db
      .collection('signals')
      .where('userId', '==', uid)
      .get();

    const batch = db.batch();
    signalsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`Deleted data for user: ${uid}`);
  } catch (error) {
    console.error('Error deleting user data:', error);
  }
});

// Reset daily signal limits at midnight
export const resetDailyLimits = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('America/New_York')
  .onRun(async () => {
    try {
      const freeUsers = await db
        .collection('users')
        .where('subscription.status', '==', 'free')
        .get();

      const batch = db.batch();

      freeUsers.forEach((doc) => {
        batch.update(doc.ref, {
          'subscription.signalsUsedToday': 0,
          'subscription.lastResetDate': admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      await batch.commit();
      console.log(`Reset daily limits for ${freeUsers.size} free users`);
    } catch (error) {
      console.error('Error resetting daily limits:', error);
    }

    return null;
  });

// Update last login timestamp
export const updateLastLogin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    await db.collection('users').doc(context.auth.uid).update({
      'metadata.lastLogin': admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating last login:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update last login');
  }
});