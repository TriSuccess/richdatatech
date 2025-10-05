import { NextRequest } from "next/server";
import Stripe from "stripe";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin (do this once)
if (!global.firebaseAdminInitialized) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!))
  });
  global.firebaseAdminInitialized = true;
}
const db = getFirestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!sig) return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", errMsg);
    return new Response(`Webhook Error: ${errMsg}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.uid;

    if (uid) {
      // mark the user as having purchased Course 1
      await db.collection("course2").doc(uid).set(
        { purchases: { paid1: true } },
        { merge: true }
      );
      console.log(`Purchase recorded for UID: ${uid}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
