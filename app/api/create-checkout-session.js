import Stripe from "stripe";
import { getFirestore, doc, updateDoc } from "firebase-admin/firestore";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const { uid } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { price: "price_1RqaLeJOLIr6wNsmGRK6tXXP", quantity: 1 } // replace with your Stripe Price ID
      ],
      success_url: `${req.headers.origin}/course1.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/course1.html?canceled=true`,
      metadata: { uid }
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
}
