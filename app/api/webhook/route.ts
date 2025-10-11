export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/* ✅ Optional fallback domain — useful for debugging and verifying which environment you’re in.
   You can safely leave this here; it won't interfere with your webhook logic.
   It’s mainly for clarity and logging when testing different environments (desktop vs mobile).
*/
const FALLBACK_DOMAIN =
  process.env.PUBLIC_URL || "https://your-vercel-app-domain.vercel.app";

// ✅ Initialize Firebase Admin SDK only once
if (!getApps().length) {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in environment variables!');
  }

  const serviceAccount = JSON.parse(serviceAccountJSON);

  // ✅ Critical for PEM key parsing (prevents DECODER routines::unsupported error)
  if (serviceAccount.private_key?.includes('\\n')) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  // Optional: helpful debug logging
  console.log(
    '🔥 Firebase initialized — Runtime:',
    process.env.VERCEL_ENV,
    '| Domain:',
    FALLBACK_DOMAIN
  );

  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

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

  // ✅ Read raw request body
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

  // ✅ Handle the Stripe event
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
        console.error(
          `❌ Firestore update failed for user ${userId}:`,
          firestoreErr
        );
      }
    } else {
      console.warn('⚠️ No user ID found in Stripe session metadata');
    }
  } else {
    console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
