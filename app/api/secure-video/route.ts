import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

// --- Firebase Admin setup (singleton) ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);

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

export async function POST(req: NextRequest) {
  try {
    // 1. Parse body & get token
    const body: { uid?: string; productId?: string } = await req.json();
    const { uid, productId } = body;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse(JSON.stringify({ error: "Missing auth token" }), { status: 401, headers: corsHeaders });
    }
    const idToken = authHeader.split("Bearer ")[1];

    // 2. Verify Firebase ID token
    let decoded: DecodedIdToken;
    try {
      decoded = await authAdmin.verifyIdToken(idToken);
      if (decoded.uid !== uid) throw new Error("UID mismatch");
    } catch (error) {
      return new NextResponse(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // 3. Check Firestore for purchase
    const userDoc = await db.collection("course2").doc(uid).get();
    const purchases = userDoc.data()?.purchases as Record<string, boolean> | undefined;
    if (!userDoc.exists || !purchases?.[productId ?? ""]) {
      return new NextResponse(JSON.stringify({ error: "Not purchased" }), { status: 403, headers: corsHeaders });
    }

    // 4. Generate signed URL for video
    const filePath = "videos/paid_2.mp4";
    const [signedUrl] = await storage.bucket().file(filePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });

    // Log the signed URL for debugging (will appear in Vercel logs)
    // eslint-disable-next-line no-console
    console.log("Generated signed video URL:", signedUrl);

    return new NextResponse(
      JSON.stringify({ url: signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    // eslint-disable-next-line no-console
    console.error("Error in /api/secure-video:", message);
    return new NextResponse(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders }
    );
  }
}