import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

// --------- 1. FIREBASE ADMIN INIT ---------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// --------- 2. BASIC AUTH CONFIG FOR VIDEO FOLDER ---------
const VIDEO_DOMAIN = "https://www.richdatatech.com/videos";
const VIDEO_USER = process.env.VIDEO_USER!; // set in Vercel env
const VIDEO_PASS = process.env.VIDEO_PASS!; // set in Vercel env

// --------- 3. HANDLER ---------
export async function POST(req: NextRequest) {
  try {
    // 1. Parse body and get token
    const { uid, productId, file } = await req.json();
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const idToken = auth.split(" ")[1];

    // 2. Verify Firebase token
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (decoded.uid !== uid) return NextResponse.json({ error: "Token mismatch" }, { status: 401 });

    // 3. Firestore check: is paid?
    const snap = await db.collection("course2").doc(uid).get();
    if (!snap.exists || !snap.data()?.purchases?.[productId]) {
      return NextResponse.json({ error: "Not paid" }, { status: 403 });
    }
    // 4. Validate file path
    if (!/^[\w\-]+\.mp4$/.test(file)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });

    // 5. Fetch the video with basic auth
    const videoUrl = `${VIDEO_DOMAIN}/pbic7i/${file}`;
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${VIDEO_USER}:${VIDEO_PASS}`).toString("base64"),
      },
    });

    if (!videoRes.ok) {
      return NextResponse.json({ error: "Could not fetch video" }, { status: 502 });
    }

    // 6. Stream the video back to client
    const headers = new Headers(videoRes.headers);
    // Remove potentially dangerous headers
    headers.delete("set-cookie");
    headers.set("cross-origin-resource-policy", "same-origin");
    headers.set("cache-control", "private, max-age=3600");

    // Pass-through the video stream
    return new NextResponse(videoRes.body, {
      status: 200,
      headers,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

// --------- 4. Optional: GET for Pre-signed URLs (if you want to support GET requests too) ---------
// export async function GET(req: NextRequest) {
//   /* ...similar logic, but with query params... */
// }