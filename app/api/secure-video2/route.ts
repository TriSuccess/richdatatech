import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, DecodedIdToken } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);

let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: "course2-f1bdb.appspot.com", // Correct bucket name!
  });
} else {
  adminApp = getApps()[0];
}
const authAdmin = getAuth(adminApp);
const storage = getStorage(adminApp);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body: { uid?: string } = await req.json();
    const { uid } = body;
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new NextResponse(JSON.stringify({ error: "Missing auth token" }), { status: 401, headers: corsHeaders });
    }
    const idToken = authHeader.split("Bearer ")[1];

    let decoded: DecodedIdToken;
    try {
      decoded = await authAdmin.verifyIdToken(idToken);
      if (uid && decoded.uid !== uid) throw new Error("UID mismatch");
    } catch (error) {
      return new NextResponse(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    // Any logged-in user is allowed, no Firestore/paywall check!

    const filePath = "videos/1.mp4";
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