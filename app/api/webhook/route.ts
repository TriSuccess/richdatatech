import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text(); // raw body required for signature verification
  const signature = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log('✅ Webhook received:', event.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.metadata?.uid; // ✅ match your checkout code

      console.log('🔎 Session metadata:', session.metadata);
      console.log('🔎 Extracted UID:', uid);

      if (uid) {
        try {
          await admin.firestore().collection('course2').doc(uid).update({
            paid: true,
          });
          console.log(`✅ User ${uid} marked as paid in Firestore`);
        } catch (err) {
          console.error('❌ Error updating Firestore:', err);
        }
      } else {
        console.error('❌ No UID found in session metadata');
      }
      break;
    }

    default:
      console.log(`⚠️ Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
