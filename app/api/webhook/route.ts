export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// --- Robust Service Account Loader ---
function getServiceAccount() {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!base64) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_B64 env variable");
  }
  let jsonString = Buffer.from(base64, "base64").toString("utf-8");
  // Fix for any escaped newlines (if present)
  try {
    // Try parsing directly first
    return JSON.parse(jsonString);
  } catch (err) {
    // Fallback: replace any literal \\n with \n and try again
    jsonString = jsonString.replace(/\\n/g, '\n');
    return JSON.parse(jsonString);
  }
}

// --- Robust Firebase Admin Initialization ---
function robustFirebaseInit() {
  if (!getApps().length) {
    try {
      const serviceAccount = getServiceAccount();
      initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized.");
    } catch (err) {
      console.error("❌ Failed to initialize Firebase Admin:", err);
      throw err;
    }
  }
}
robustFirebaseInit();

const db = getFirestore();
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY env variable");
const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

// --- Robust Webhook Handler ---
export async function POST(req: NextRequest) {
  let sig: string | null = null;
  let endpointSecret: string | undefined = undefined;
  try {
    sig = req.headers.get("stripe-signature");
    endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      console.error("❌ Missing Stripe signature header.");
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }
    if (!endpointSecret) {
      console.error("❌ Missing STRIPE_WEBHOOK_SECRET environment variable.");
      return NextResponse.json({ error: "Missing Stripe webhook secret" }, { status: 500 });
    }

    const rawBody = await req.arrayBuffer();
    const bodyBuffer = Buffer.from(rawBody);

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(bodyBuffer, sig, endpointSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`⚠️ Webhook signature verification failed: ${message}`);
      if (err instanceof Error && err.stack) console.error("Stack:", err.stack);
      // Do not expose raw payload or stack in response
      return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
    }

    // ✅ Handle the event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.uid;

      if (userId) {
        try {
          await db
            .collection("course2")
            .doc(userId)
            .set(
              { purchases: { paid1: true }, updatedAt: Timestamp.now() },
              { merge: true }
            );
          console.log(`✅ Firestore updated successfully for user: ${userId}`);
        } catch (firestoreErr) {
          // Log with stack if available, but don't leak sensitive info
          if (firestoreErr instanceof Error && firestoreErr.stack) {
            console.error(
              `❌ Firestore update failed for user ${userId}:`,
              firestoreErr.message,
              "\nStack:", firestoreErr.stack
            );
          } else {
            console.error(`❌ Firestore update failed for user ${userId}:`, firestoreErr);
          }
          // Optionally, notify your error tracking system here
        }
      } else {
        console.warn("⚠️ No user ID found in Stripe session metadata");
      }
    } else {
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Catch any unexpected errors
    console.error("❌ Unexpected error in Stripe Webhook handler:", err);
    // Optionally, notify your error tracking system here
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}