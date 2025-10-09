export const runtime = "nodejs"; // Ensure Firebase + Buffer work properly

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Initialize Firebase Admin (only once)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ✅ Allowed frontend origins
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

// ✅ Generate safe CORS headers
function getCorsHeaders(origin?: string): Record<string, string> {
  const safeOrigin = allowedOrigins.includes(origin ?? "")
    ? origin!
    : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
  };
}

// ✅ Preflight CORS (for mobile browsers especially)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const headers = getCorsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

// ✅ Handle POST — verify user and stream secure video
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { file } = await req.json();
    if (!file) {
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    // 🔹 Verify Firebase ID token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    // 🔹 Whitelisted files
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      "databricks1.mp4",
    ];
    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // 🔹 Basic Auth (cPanel)
    const username = "Razor7";
    const password = "S1M3o;OY}ixq";
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔹 Fetch video with range support
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        Range: req.headers.get("range") || "",
      },
    });

    if (!videoRes.ok || !videoRes.body) {
      console.error(`Video fetch failed for: ${file}, status: ${videoRes.status}`);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // ✅ Forward headers for streaming
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    const len = videoRes.headers.get("content-length");
    const range = videoRes.headers.get("content-range");
    if (len) headers.set("Content-Length", len);
    if (range) headers.set("Content-Range", range);

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err: unknown) {
    console.error("secure-video error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}
