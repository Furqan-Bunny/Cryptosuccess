import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onUserDelete = functions.auth.user().onDelete(async (user) => {
  try {
    // Soft delete - mark user data as deleted but keep for compliance
    await db.collection('users').doc(user.uid).update({
      deleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      email: `deleted_${user.uid}@deleted.com`, // Anonymize email
      displayName: 'Deleted User',
      photoURL: null,
    });

    console.log(`User data anonymized for ${user.uid}`);
  } catch (error) {
    console.error('Error handling user deletion:', error);
  }
});