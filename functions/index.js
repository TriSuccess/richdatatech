const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

// Unlock course using metadata.unlock_key from Stripe payment
exports.stripePaymentUnlock = onDocumentCreated("customers/{uid}/payments/{paymentId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const payment = snap.data();
  const uid = event.params.uid;

  if (payment.status === "succeeded") {
    const unlockKey =
      payment.metadata && payment.metadata.unlock_key
        ? payment.metadata.unlock_key
        : null;

    if (unlockKey) {
      const userDocRef = admin.firestore().doc(`course2/${uid}`);
      try {
        await userDocRef.set({ purchases: { [unlockKey]: true } }, { merge: true });
      } catch (err) {
        console.error("Firestore write failed:", err);
      }
    }
    // Optionally: else { /* silently ignore if no unlockKey */ }
  }
  // Optionally: else { /* silently ignore if not succeeded */ }
});