// app/api/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID as string,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(req: NextRequest) {
  try {
    // Get the raw request body
    const text = await req.text();
    
    // Get the signature from the headers
    const signature = req.headers.get('stripe-signature');
    
    if (!signature) {
      return NextResponse.json({ error: 'No signature header found' }, { status: 400 });
    }
    
    // Verify the event
    let event: Stripe.Event;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
    
    try {
      event = stripe.webhooks.constructEvent(
        text,
        signature,
        endpointSecret
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.log(`⚠️ Webhook signature verification failed: ${errorMessage}`);
      return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
    }
    
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Extract user ID from client_reference_id or metadata
        const userId = session.client_reference_id || 
                      (session.metadata && session.metadata.userId);
        
        if (userId) {
          try {
            // Update Firestore document
            await db.collection('users').doc(userId).collection('purchases').doc('subscription').update({
              paid1: true,
              updatedAt: Timestamp.now()
            });
            console.log(`Updated payment status for user: ${userId}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error updating Firestore: ${errorMessage}`);
            return NextResponse.json({ error: 'Error updating database' }, { status: 500 });
          }
        } else {
          console.log('No user ID found in the session');
        }
        break;
      }
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    // Return a 200 response to acknowledge receipt of the event
    return NextResponse.json({ received: true });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', errorMessage);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}