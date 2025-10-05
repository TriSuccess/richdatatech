import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase only once using the full service account JSON
if (!getApps().length) {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not set in environment variables!');
  }
  const serviceAccount = JSON.parse(serviceAccountJSON);
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
    console.error('Missing Stripe signature header.');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }
  if (!endpointSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET environment variable.');
    return NextResponse.json({ error: 'Missing Stripe webhook secret' }, { status: 500 });
  }

  // Get the raw request body as a Buffer
  const rawBody = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`⚠️ Webhook signature verification failed: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error('Error stack:', err.stack);
    }
    console.error('Payload that failed verification:', bodyBuffer.toString());
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // Handle Stripe events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.uid;

    if (userId) {
      await db
        .collection('course2')
        .doc(userId)
        .collection('purchases')
        .doc('paid1')
        .set({ paid1: true, updatedAt: Timestamp.now() }, { merge: true });
        );
      console.log(`✅ Updated Firestore for user ${userId}`);
    } else {
      console.warn('⚠️ No user ID found in Stripe session metadata');
    }
  } else {
    console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}