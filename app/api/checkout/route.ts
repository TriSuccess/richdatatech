import { NextRequest } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// CORS headers to allow Firebase frontend
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // or restrict to your Firebase domain
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: { name: string; price: number; quantity: number }[] };

    if (!items || !items.length) {
      return new Response(JSON.stringify({ error: 'No items provided' }), { status: 400, headers: corsHeaders });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map(item => ({
        price_data: {
          currency: 'usd',
          product_data: { name: item.name },
          unit_amount: item.price * 100,
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/success`,
      cancel_url: `${req.headers.get('origin')}/cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe Checkout error:', errMsg);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: corsHeaders });
  }
}
