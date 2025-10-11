import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

// Initialize Firebase once
if (!getApps().length) {
  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
  const serviceAccount = JSON.parse(serviceAccountJSON);
  if (serviceAccount.private_key?.includes('\\n')) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const sig = req.headers.get('stripe-signature');
    // ... rest of your webhook logic
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
