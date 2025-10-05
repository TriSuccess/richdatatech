import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

console.log('STRIPE_SECRET_KEY exists?', !!process.env.STRIPE_SECRET_KEY);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    console.log('Received request');

    const body = await req.json();
    console.log('Request body:', body);

    if (!body.uid) {
      console.error('No uid provided');
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        { price: 'price_1RqaLeJOLIr6wNsmGRK6tXXP', quantity: 1 } // <-- Replace with your Stripe Price ID
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/success`,
      cancel_url: `${req.headers.get('origin')}/cancel`,
      metadata: { firebaseUid: body.uid },
    });

    console.log('Stripe session created:', session.id);

    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    console.error('Error creating Stripe session:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
