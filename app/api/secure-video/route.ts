import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// DEBUG LOGGING: Check env vars at runtime (DO NOT log full private key in production)
const certObj = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};
// Only log the beginning/end of the private key for debugging
console.log("CERT OBJ DEBUG:", {
  projectId: certObj.projectId,
  clientEmail: certObj.clientEmail,
  privateKey: certObj.privateKey
    ? certObj.privateKey.slice(0, 20) + "...[snip]..." + certObj.privateKey.slice(-20)
    : certObj.privateKey,
  privateKeyType: typeof certObj.privateKey,
});

if (!getApps().length) {
  initializeApp({
    credential: cert(certObj),
  });
}

export async function POST(req: NextRequest) {
  try {
    // ...rest of your code remains unchanged
  } catch (err) {
    let message = "Unauthorized";
    if (err && typeof err === "object" && "message" in err) {
      message = String((err as { message?: string }).message);
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }
}