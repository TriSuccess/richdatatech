// app/api/webhook/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Declare global property for Firebase Admin initialization
declare global {
  var firebaseAdminInitialized: boolean | undefined;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2022-11-15" });

// Initialize Firebase Admin once
if (!globalThis.firebaseAdminInitialized) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
  });
  globalThis.firebaseAdminInitialized = true;
}

const db = getFirestore();

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
    const productId = session.metadata?.productId; // e.g., "paid1", "paid2", ..., "paid10"

    if (uid && productId) {
      try {
        await db.collection("course2").doc(uid).set(
          { purchases: { [productId]: true } }, // dynamic course key
          { merge: true } // preserve other purchases
        );
        console.log(`Purchase recorded for UID: ${uid}, product: ${productId}`);
      } catch (err) {
        console.error(`Failed to record purchase for UID: ${uid}, product: ${productId}`, err);
        return new Response(`Failed to record purchase: ${err}`, { status: 500 });
      }
    } else {
      console.warn("Webhook received session without uid or productId metadata:", session);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
