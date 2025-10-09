import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Initialize Firebase Admin once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ✅ Allowed Origins (desktop + mobile)
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

// ✅ Always return a fully defined string record
function getCorsHeaders(origin?: string): Record<string, string> {
  // Always return a defined, safe origin
  const safeOrigin: string =
    (origin && allowedOrigins.includes(origin)) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ✅ Handle OPTIONS (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const headers = getCorsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

// ✅ Handle POST request — verify + stream video
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { file } = await req.json();
    if (!file) {
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    // 🔹 Verify Firebase ID Token
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

    // 🔹 Basic Auth
    const username = "Razor7";
    const password = "S1M3o;OY}ixq";
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔹 Fetch video with Range support
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        Range: req.headers.get("range") || "",
      },
    });

    if (!videoRes.ok) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // ✅ Forward stream
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
