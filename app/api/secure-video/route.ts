import { NextRequest } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// --- CORS helper ---
const corsHeaders = {
  // For production, set this to your frontend domain for security!
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const certObj = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!getApps().length) {
  initializeApp({
    credential: cert(certObj),
  });
}

// Handle preflight CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Parse auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    // Parse request body
    const { uid, productId, file } = await req.json();

    // Firestore access check (example: expects purchases.paid1 to be true)
    const db = getFirestore();
    const userDoc = await db.collection("course2").doc(uid).get();
    if (!userDoc.exists) {
      return new Response(JSON.stringify({ error: "User data not found" }), {
        status: 403,
        headers: corsHeaders,
      });
    }
    const data = userDoc.data();
    if (!data?.purchases?.[productId]) {
      return new Response(JSON.stringify({ error: "No access to this content" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Build the secure video URL (e.g., via your Vercel proxy or signed URL)
    // This example assumes you proxy via /api/secure-video2 (adjust as needed)
    const url = `https://richdatatech.vercel.app/api/secure-video2?file=${encodeURIComponent(file)}`;

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    let message = "Unauthorized";
    if (err && typeof err === "object" && "message" in err) {
      message = String((err as { message?: string }).message);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: corsHeaders,
    });
  }
}