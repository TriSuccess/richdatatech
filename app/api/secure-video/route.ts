export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Firebase Admin initialization (only once)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
            privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ✅ CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://course2-f1bdb.web.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ✅ Handle preflight (CORS)
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ✅ Handle POST requests
export async function POST(req: NextRequest) {
  try {
    const { file } = await req.json();

    if (!file) {
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    // 🔹 Verify Firebase Auth Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    // 🔹 Whitelisted video files
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      "databricks1.mp4",
    ];

    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // 🔹 cPanel Auth
    const username = "Razor7"; // ⚠️ Replace or move to env vars
    const password = "S1M3o;OY}ixq"; // ⚠️ Replace or move to env vars
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔹 Check access to the video
    const headRes = await fetch(videoUrl, {
      method: "HEAD",
      headers: { Authorization: `Basic ${basic}` },
    });

    if (!headRes.ok) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // ✅ Respond with JSON + CORS headers
    return new Response(JSON.stringify({ url: videoUrl }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("secure-video error:", message);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}

