import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
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
    storageBucket: "course2-f1bdb.appspot.com", // fixed typo: was 'firebasestorage.app'
  });
} else {
  adminApp = getApps()[0];
}
const authAdmin = getAuth(adminApp);
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
    const body: { uid?: string } = await req.json();
    const { uid } = body;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse(JSON.stringify({ error: "Missing auth token" }), { status: 401, headers: corsHeaders });
    }
    const idToken = authHeader.split("Bearer ")[1];

    // 2. Verify Firebase ID token
    let decoded: DecodedIdToken;
    try {
      decoded = await authAdmin.verifyIdToken(idToken);
      if (uid && decoded.uid !== uid) throw new Error("UID mismatch");
    } catch (error) {
      return new NextResponse(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // 3. No paywall: Any logged-in user is allowed!

    // 4. Generate signed URL for video
    const filePath = "videos/1.mp4"; // Change this if you want a different video for members
    const [signedUrl] = await storage.bucket().file(filePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });

    return new NextResponse(
      JSON.stringify({ url: signedUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return new NextResponse(
      JSON.stringify({ error: message }),
      { status: 500, headers: corsHeaders }
    );
  }
}