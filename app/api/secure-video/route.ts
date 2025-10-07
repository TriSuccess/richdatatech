import { NextRequest, NextResponse } from "next/server";

// --- CORS headers ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// --- Firebase Admin setup (singleton pattern) ---
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Parse service account from Vercel env (stringified JSON)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);

// Ensure single app instance (important for hot reload/dev server)
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: "course2-f1bdb.appspot.com",
  });
} else {
  adminApp = getApps()[0];
}
const authAdmin = getAuth(adminApp);
const db = getFirestore(adminApp);
const storage = getStorage(adminApp);

// --- CORS preflight ---
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// --- Main logic ---
export async function POST(req: NextRequest) {
  try {
    // 1. Parse body & get token
    const body = await req.json();
    const { uid, productId } = body;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse(JSON.stringify({ error: "Missing auth token" }), { status: 401, headers: corsHeaders });
    }
    const idToken = authHeader.split("Bearer ")[1];

    // 2. Verify Firebase ID token
    let decoded: any;
    try {
      decoded = await authAdmin.verifyIdToken(idToken);
      if (decoded.uid !== uid) throw new Error("UID mismatch");
    } catch (err) {
      return new NextResponse(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // 3. Check Firestore for purchase
    const userDoc = await db.collection("course2").doc(uid).get();
    if (!userDoc.exists || !userDoc.data()?.purchases?.[productId]) {
      return new NextResponse(JSON.stringify({ error: "Not purchased" }), { status: 403, headers: corsHeaders });
    }

    // 4. Generate a signed URL for the video file (valid 5 min)
    const filePath = "videos/paid_2.mp4";
    const [signedUrl] = await storage.bucket().file(filePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    return new NextResponse(
      JSON.stringify({ url: signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new NextResponse(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
}