export const config = {
  api: {
    bodyParser: false, // important: prevents Next.js from parsing JSON
  },
};

import { Stripe } from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // 1️⃣ Read raw bytes (like express.raw)
  const buf = await req.arrayBuffer();
  const body = Buffer.from(buf); // exact bytes Stripe expects

  // 2️⃣ Get Stripe signature
  const stripeSignature = req.headers.get('stripe-signature');
  if (!stripeSignature) {
    return NextResponse.json({ message: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  // 3️⃣ Verify Stripe signature
  try {
    event = stripe.webhooks.constructEvent(
      body, 
      stripeSignature, 
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ Stripe webhook verification failed:', errMsg);
    return NextResponse.json({ message: `Webhook Error: ${errMsg}` }, { status: 400 });
  }

  // 4️⃣ Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.uid;
    const productId = session.metadata?.productId;

    if (uid && productId) {
      console.log(`💰 Purchase recorded for UID: ${uid}, product: ${productId}`);
      // Add Firestore or other logic here if needed
    }
  }

  // 5️⃣ Respond with 200 to acknowledge receipt
  return NextResponse.json({ message: 'Received' }, { status: 200 });
}
