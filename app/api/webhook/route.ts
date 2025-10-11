export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// --- CONSTANTS ---
const FALLBACK_DOMAIN =
  process.env.PUBLIC_URL || "https://your-vercel-app-domain.vercel.app";

// --- FIREBASE INIT ---
if (!getApps().length) {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in environment variables!');
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(serviceAccountJSON);
  } catch (err) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:', err);
    throw err;
  }

  // ✅ Ensure private_key is in correct PEM format (handles both \\n and real newlines)
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .trim();
  }

  // ✅ Extra sanity check
  if (!serviceAccount.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) {
    console.error('❌ Invalid private key format detected.');
    throw new Error('Firebase private key is not in valid PEM format.');
  }

  console.log(
    '🔥 Firebase initialized — runtime:',
    process.env.VERCEL_ENV,
    '| domain:',
    FALLBACK_DOMAIN
  );

  initializeApp({
    credential: cert(serviceAccount),
  });
}

// --- SERVICES ---
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// --- HANDLER ---
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    console.error('❌ Missing Stripe signature header.');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!endpointSecret) {
    console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable.');
    return NextResponse.json({ error: 'Missing Stripe webhook secret' }, { status: 500 });
  }

  const rawBody = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`⚠️ Webhook signature verification failed: ${message}`);
    if (err instanceof Error && err.stack) console.error('Stack:', err.stack);
    console.error('Payload that failed verification:', bodyBuffer.toString());
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.uid;

    if (userId) {
      try {
        await db
          .collection('course2')
          .doc(userId)
          .set(
            { purchases: { paid1: true }, updatedAt: Timestamp.now() },
            { merge: true }
          );
        console.log(`✅ Firestore updated successfully for user: ${userId}`);
      } catch (firestoreErr) {
        console.error(`❌ Firestore update failed for user ${userId}:`, firestoreErr);
      }
    } else {
      console.warn('⚠️ No user ID found in Stripe session metadata');
    }
  } else {
    console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
