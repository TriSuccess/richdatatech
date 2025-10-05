import Stripe from "stripe";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "Missing UID" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        { price: "price_1RqaLeJOLIr6wNsmGRK6tXXP" } // quantity defaults to 1
      ],
      success_url: `${req.headers.origin}/course1.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/course1.html?canceled=true`,
      metadata: { uid: uid.toString() }
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ error: "Unable to create checkout session" });
  }
}
