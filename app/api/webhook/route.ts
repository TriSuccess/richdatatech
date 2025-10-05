import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// DO NOT use Edge runtime for Stripe webhooks!
// (Edge runtime breaks Buffer and raw body access)

// Initialize Firebase
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
// REMOVED: apiVersion property!
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  if (!sig) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  // Get the raw request body as a Buffer
  const bodyBuffer = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`⚠️ Webhook signature verification failed: ${message}`);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // Handle Stripe events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.userId;

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
        console.warn('⚠️ No user ID found in Stripe session');
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}