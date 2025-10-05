import { Stripe } from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  // Raw bytes
  const buf = await req.arrayBuffer();
  const body = Buffer.from(buf);

  const stripeSignature = req.headers.get('stripe-signature');
  if (!stripeSignature) return NextResponse.json({ message: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, stripeSignature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ Stripe webhook verification failed:', errMsg);
    return NextResponse.json({ message: `Webhook Error: ${errMsg}` }, { status: 400 });
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log('✅ Checkout completed:', session.id);
  }

  return NextResponse.json({ message: 'Received' }, { status: 200 });
}
