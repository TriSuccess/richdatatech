import { NextRequest } from "next/server";
import Stripe from "stripe";

// Initialize Stripe without specifying apiVersion
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // Get the raw request body as text
  const body = await req.text();

  // Get Stripe signature header
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event;

  try {
    // Verify webhook signature using the raw payload
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook verification failed:", errMsg);
    return new Response(`Webhook Error: ${errMsg}`, { status: 400 });
  }

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.uid;
    const productId = session.metadata?.productId;

    if (uid && productId) {
      console.log(`Purchase recorded for UID: ${uid}, product: ${productId}`);
      // Replace this with any logic you need, e.g., call your own API
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
