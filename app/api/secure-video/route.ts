import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Force Node.js runtime (important for streaming)
export const runtime = "nodejs";

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

function getCorsHeaders(origin?: string): Record<string, string> {
  const safeOrigin = allowedOrigins.includes(origin ?? "") ? origin! : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ✅ Handle OPTIONS (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// ✅ Handle POST request — verify + stream video
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { file } = await req.json();
    if (!file) {
      console.error("❌ Missing file in request body");
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    // 🔹 Verify Firebase ID Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ Missing or invalid Authorization header");
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
      console.error("❌ Invalid file:", file);
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // 🔹 Basic Auth (from cPanel)
    const username = "Razor7";
    const password = "S1M3o;OY}ixq";
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔍 DEBUG LOGS
    console.log("📹 Fetching video from:", videoUrl);
    console.log("🧾 Headers sent to origin:", {
      Authorization: `Basic ${basic}`,
      Range: req.headers.get("range") || "(none)",
    });

    // 🔹 Test access with HEAD first
    const testRes = await fetch(videoUrl, {
      method: "HEAD",
      headers: { Authorization: `Basic ${basic}` },
    });
    console.log("🔍 HEAD test status:", testRes.status);

    if (!testRes.ok) {
      console.error("❌ HEAD request failed, cannot access video from backend");
      return new Response("Video not found (HEAD)", {
        status: testRes.status,
        headers: corsHeaders,
      });
    }

    // 🔹 Fetch the actual video (skip Range for now to avoid cPanel blocking)
    const videoRes = await fetch(videoUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basic}`,
        "User-Agent": "Mozilla/5.0 (compatible; VercelBot/1.0; +https://vercel.com)",
        // Range: req.headers.get("range") || "",
      },
    });

    console.log("📦 Origin response status:", videoRes.status);

    if (!videoRes.ok) {
      console.error("❌ Video fetch failed with status:", videoRes.status);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // ✅ Forward video stream with correct headers
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "video/mp4");
    if (videoRes.headers.get("content-length"))
      headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range"))
      headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    console.log("✅ Streaming video to client:", file);

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers,
    });
  } catch (err: unknown) {
    console.error("💥 secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}
