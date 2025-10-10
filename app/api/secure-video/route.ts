// Force Node.js runtime for streaming & Firebase Admin
export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// Firebase Admin init
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Allowed CORS Origins
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

// CORS helper
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

// Preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// Whitelist flat filenames for .m3u8 and .ts
function isAllowedFile(file: string) {
  // Match pbic7i/snowflake1.m3u8, pbic7i/snowflake1_0000.ts, pbic7i/python2.m3u8, etc.
  return /^pbic7i\/(powerbi|python|databricks|snowflake)\d+(\.m3u8|_\d{4}\.ts|\.mp4)$/.test(file);
}

// Content-Type for streaming
function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

// GET handler: proxy and secure HLS/MP4
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

    // Verify Firebase ID token
    await getAuth().verifyIdToken(token);

    // Whitelist file names
    if (!isAllowedFile(file)) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // cPanel Basic Auth
    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    // Build the video or HLS file URL
    const videoUrl = `https://www.richdatatech.com/videos/${file}`;

    // Proxy the video/HLS file (with Range, for streaming support)
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        Range: req.headers.get("range") || "",
      },
    });

    if (!videoRes.ok || !videoRes.body) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // Compose headers
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
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