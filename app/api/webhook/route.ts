import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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

  // Log headers for debugging
  console.log('Stripe webhook headers:', JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));
  // Log Stripe signature
  console.log('Stripe signature:', sig);

  if (!sig) {
    console.error('Missing Stripe signature header.');
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  // Get the raw request body as a Buffer
  const rawBody = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  // Log raw body as hex and utf8 for debugging
  console.log('Raw request body (hex):', bodyBuffer.toString('hex'));
  console.log('Raw request body (utf8):', bodyBuffer.toString('utf8'));

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyBuffer, sig, endpointSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`⚠️ Webhook signature verification failed: ${message}`);
    // Log detailed error stack if available
    if (err instanceof Error && err.stack) {
      console.error('Error stack:', err.stack);
    }
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // ...handle event as before...

  return NextResponse.json({ received: true });
}