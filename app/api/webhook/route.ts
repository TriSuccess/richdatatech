import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  if (!sig) {
    console.error('Missing Stripe signature header.');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
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

  // Use the user id from Stripe session metadata!
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.uid; // <-- Use the metadata uid passed when you created the session

    if (userId) {
      await db
        .collection('users')
        .doc(userId)
        .collection('purchases')
        .doc('subscription')
        .set(
          { paid1: true, updatedAt: Timestamp.now() },
          { merge: true }
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