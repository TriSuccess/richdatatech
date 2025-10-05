import { Stripe } from 'stripe';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});

// Optional: Firebase imports if you need them
// import { initializeApp, cert, getApps } from 'firebase-admin/app';
// import { getFirestore } from 'firebase-admin/firestore';

// declare global { var firebaseAdminInitialized: boolean | undefined; }
// let db: ReturnType<typeof getFirestore>;

export async function POST(req: Request) {
  let event: Stripe.Event;

  try {
    const stripeSignature = (await headers()).get('stripe-signature');

    event = stripe.webhooks.constructEvent(
      await req.text(),                 // raw body
      stripeSignature!,                 // signature header
      process.env.STRIPE_WEBHOOK_SECRET! // webhook secret
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`❌ Stripe webhook error: ${errorMessage}`);
    return NextResponse.json({ message: `Webhook Error: ${errorMessage}` }, { status: 400 });
  }

  console.log('✅ Stripe event received:', event.id, event.type);

  // List of events you want to handle
  const permittedEvents: string[] = ['checkout.session.completed'];

  if (permittedEvents.includes(event.type)) {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = session.metadata?.uid;
          const productId = session.metadata?.productId;

          if (uid && productId) {
            console.log(`💰 Purchase recorded: UID=${uid}, product=${productId}`);

            // Optional: Firestore logic
            /*
            if (!globalThis.firebaseAdminInitialized) {
              const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT!;
              const serviceAccount = JSON.parse(serviceAccountStr);
              if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
              globalThis.firebaseAdminInitialized = true;
              db = getFirestore();
            }
            await db.collection("course2").doc(uid).set({ purchases: { [productId]: true } }, { merge: true });
            */
          }
          break;
        default:
          console.log(`Unhandled event: ${event.type}`);
      }
    } catch (err) {
      console.error('Webhook handler failed:', err);
      return NextResponse.json({ message: 'Webhook handler failed' }, { status: 500 });
    }
  }

  // Respond to acknowledge receipt
  return NextResponse.json({ message: 'Received' }, { status: 200 });
}
