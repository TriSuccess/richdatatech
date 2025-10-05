import { NextRequest } from "next/server";
import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

declare global {
  var firebaseAdminInitialized: boolean | undefined;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

let db: ReturnType<typeof getFirestore>;

export async function POST(req: NextRequest) {
  // Initialize Firebase Admin at runtime
  if (!globalThis.firebaseAdminInitialized) {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountStr) throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing");

    try {
      const serviceAccount = JSON.parse(serviceAccountStr);
      if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
      }
      globalThis.firebaseAdminInitialized = true;
      db = getFirestore();
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", err);
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT JSON");
    }
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig) return new Response("Missing Stripe signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook Error: ${errMsg}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const uid = session.metadata?.uid;
    const productId = session.metadata?.productId;
    if (uid && productId) {
      await db.collection("course2").doc(uid).set({ purchases: { [productId]: true } }, { merge: true });
      console.log(`Purchase recorded for UID: ${uid}, product: ${productId}`);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
