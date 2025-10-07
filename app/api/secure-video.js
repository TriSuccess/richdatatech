import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    storageBucket: "course2-f1bdb.appspot.com"
  });
}

export async function POST(req) {
  const { uid, productId } = await req.json();
  const idToken = req.headers.get('authorization')?.split('Bearer ')[1];

  // 1. Verify Firebase ID token
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.uid !== uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // 2. Check Firestore purchase
  const userDoc = await admin.firestore().collection("course2").doc(uid).get();
  if (!userDoc.exists || !userDoc.data().purchases?.[productId]) {
    return NextResponse.json({ error: "Not purchased" }, { status: 403 });
  }

  // 3. Generate signed URL (valid 5 min)
  const bucket = admin.storage().bucket();
  const file = bucket.file("videos/paid_2.mp4");
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000
  });

  return NextResponse.json({ url });
}