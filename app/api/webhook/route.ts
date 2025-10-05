import { NextRequest } from "next/server";
import Stripe from "stripe";

// Stripe client without apiVersion
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // Get raw request body for Stripe signature verification
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing Stripe signature", { status: 400 });

  const body = await req.text(); 
  let event: Stripe.Event;

  try {
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
      // You can add any other logic here (e.g., call another API)
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
