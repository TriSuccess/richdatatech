import { NextRequest } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Set this to your production domain, or configure via env variable!
const FALLBACK_DOMAIN = process.env.PUBLIC_URL || "https://course2-f1bdb.web.app/paid1.html";

function isValidOrigin(origin: string | null): origin is string {
  return !!origin && /^https?:\/\//.test(origin);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { uid, items } = (await req.json()) as {
      uid: string;
      items: { price: string }[]; // only Price ID now
    };

    if (!uid || !items?.length) {
      return new Response(JSON.stringify({ error: "Missing UID or items" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use the origin header if valid, otherwise fallback
    const rawOrigin = req.headers.get("origin");
    const origin = isValidOrigin(rawOrigin) ? rawOrigin : FALLBACK_DOMAIN;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: items.map((item) => ({
        price: item.price,
        quantity: 1,
      })),
      mode: "payment",
      success_url: `${origin}/paid1.html`,
      cancel_url: `${origin}/paid1.html`,
      metadata: { uid },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Stripe Checkout error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}