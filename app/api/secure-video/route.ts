// ✅ Force Node.js runtime (required for streaming & Firebase Admin)
export const runtime = "nodejs";

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

// ✅ Allowed Origins
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

// ✅ Generate CORS headers safely
function getCorsHeaders(origin?: string) {
  const safeOrigin = allowedOrigins.includes(origin ?? "")
    ? origin
    : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as Record<string, string>;
}

// ✅ OPTIONS handler (preflight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// ✅ GET handler — fetch & stream video
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const url = new URL(req.url);
    const file = url.searchParams.get("file");
    const token = url.searchParams.get("token");

    if (!file || !token) {
      return new Response("Missing file or token", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 🔹 Verify Firebase ID token
    await getAuth().verifyIdToken(token);

    // 🔹 Whitelisted files (now supports databricks1-10 and snowflake1-10)
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      ...Array.from({ length: 10 }, (_, i) => `databricks${i + 1}.mp4`),
      ...Array.from({ length: 10 }, (_, i) => `snowflake${i + 1}.mp4`)
    ];
    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // 🔹 Basic Auth for cPanel
    const username = "Razor7"; // ⚠️ Move to env for production
    const password = "S1M3o;OY}ixq"; // ⚠️ Move to env for production
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔹 Fetch video stream (supports Range)
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        Range: req.headers.get("range") || "",
      },
    });

    if (!videoRes.ok || !videoRes.body) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // ✅ Forward video stream with proper headers
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "video/mp4");
    if (videoRes.headers.get("content-length"))
      headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range"))
      headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers,
    });
  } catch (err: unknown) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}