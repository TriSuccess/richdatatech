import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    // Parse the Bearer token from headers
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    // Verify Firebase ID token
    const decoded = await getAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // Parse POST body
    const { file, productId } = await req.json();

    // Only allow these files (protects against path traversal)
    const allowedFiles = [
      "databricks1.mp4",
      "databricks2.mp4",
      "databricks3.mp4",
      "databricks4.mp4",
      "databricks5.mp4",
      "databricks6.mp4",
      "databricks7.mp4",
      "databricks8.mp4",
      "databricks9.mp4",
      "databricks10.mp4",
    ];
    if (!allowedFiles.includes(file)) {
      return NextResponse.json({ error: "Invalid file request" }, { status: 403 });
    }

    // Check Firestore for purchases
    const db = getFirestore();
    const userDoc = await db.collection("course2").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const purchases = userDoc.data()?.purchases || {};
    if (!purchases[productId]) {
      return NextResponse.json({ error: "Not paid" }, { status: 403 });
    }

    // Build the secure video URL
    const url = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
    return NextResponse.json({ url });
  } catch (err) {
    let message = "Unauthorized";
    if (err && typeof err === "object" && "message" in err) {
      message = String((err as { message?: string }).message);
    }
    return NextResponse.json({ error: message }, { status: 401 });
  }
}