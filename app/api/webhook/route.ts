import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ✅ Make sure this is at the very top of the file
export const runtime = 'nodejs';

// Initialize Firebase only once using the full service account JSON
if (!getApps().length) {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in environment variables!');
  }

  const serviceAccount = JSON.parse(serviceAccountJSON);

  // ✅ Replace escaped newlines
  if (serviceAccount.private_key?.includes('\\n')) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  // ✅ Add this debug log right here:
  console.log(
    'Runtime:',
    process.env.VERCEL_ENV,
    '| Key snippet:',
    serviceAccount.private_key.slice(0, 30)
  );

  initializeApp({
    credential: cert(serviceAccount),
  });
}
