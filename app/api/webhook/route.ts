// api/webhook.js - Deploy this file to Vercel
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require('firebase-admin');

// Initialize Firebase (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method Not Allowed
  }
  
  const payload = req.body;
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the event came from Stripe
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    event = stripe.webhooks.constructEvent(
      payload.toString(), // Vercel requires the raw body as a string
      sig,
      endpointSecret
    );
  } catch (err) {
    console.log(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      // Extract user ID from the client_reference_id or metadata
      const userId = session.client_reference_id || 
                    (session.metadata && session.metadata.userId);
      
      if (userId) {
        try {
          // Update Firestore document
          await db.collection('users').doc(userId).collection('purchases').doc('subscription').update({
            paid1: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated payment status for user: ${userId}`);
        } catch (error) {
          console.error(`Error updating Firestore: ${error}`);
          return res.status(500).send('Error updating database');
        }
      } else {
        console.log('No user ID found in the session');
      }
      break;
      
    // Add more event types as needed
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({received: true});
}