// /api/video-access endpoint (Node.js/Express)
const admin = require("firebase-admin");
const express = require("express");
const app = express();

app.post("/api/video-access", async (req, res) => {
  const { uid, productId } = req.body;

  // 1. Verify Firebase ID token!
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.uid !== uid) return res.status(401).send("Unauthorized");
  } catch {
    return res.status(401).send("Invalid token");
  }

  // 2. Check Firestore purchase record
  const userDoc = await admin.firestore().collection("course2").doc(uid).get();
  if (!userDoc.exists || !userDoc.data().purchases?.[productId]) {
    return res.status(403).send("Not purchased");
  }

  // 3. Generate signed URL, valid 5 min
  const bucket = admin.storage().bucket();
  const file = bucket.file("videos/paid_2.mp4");
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000 // 5 minutes
  });

  res.json({ url });
});