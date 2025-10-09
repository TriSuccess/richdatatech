import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ✅ Handle POST requests
export async function POST(req: NextRequest) {
  try {
    const { uid, file } = await req.json();

    if (!file) {
      return new Response("Missing file", { status: 400 });
    }

    // ✅ Verify Firebase ID Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    // ✅ Whitelist of allowed files
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      "databricks1.mp4", // ✅ Added this file
    ];

    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403 });
    }

    // ✅ Basic Auth credentials for your protected video server
    const username = "Razor7"; // ⚠️ Hardcoded — consider using env vars for security
    const password = "S1M3o;OY}ixq"; // ⚠️ Hardcoded — consider using env vars for security
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // ✅ Check if the file exists
    const head = await fetch(videoUrl, {
      method: "HEAD",
      headers: { Authorization: `Basic ${basic}` },
    });

    if (!head.ok) {
      return new Response("Video not found", { status: 404 });
    }

    // ✅ Return secure video URL as JSON (your frontend will load it)
    return new Response(JSON.stringify({ url: videoUrl }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("secure-video2 error:", err);
    return new Response("Server error", { status: 500 });
  }
}
