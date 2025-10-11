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

// Allowed CORS origins
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

function getCorsHeaders(origin?: string) {
  const safeOrigin = allowedOrigins.includes(origin ?? "") ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as Record<string, string>;
}

// Whitelisted files (no payment needed, just login)
const allowedFiles = [
  ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
  ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
  ...Array.from({ length: 10 }, (_, i) => `databricks${i + 1}.mp4`),
  ...Array.from({ length: 10 }, (_, i) => `snowflake${i + 1}.mp4`),
  ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.m3u8`),
  ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.m3u8`),
  ...Array.from({ length: 10 }, (_, i) => `databricks${i + 1}.m3u8`),
  ...Array.from({ length: 10 }, (_, i) => `snowflake${i + 1}.m3u8`),
];

// Utility for content type
function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

// OPTIONS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// GET handler
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const url = new URL(req.url);
    const file = url.searchParams.get("file");
    let token = url.searchParams.get("token");

    // Try to get token from Authorization header if not present in query
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!file || !token) {
      return new Response("Missing file or token", { status: 400, headers: corsHeaders });
    }

    // Only require login, not payment: just verify token validity
    try {
      await getAuth().verifyIdToken(token);
    } catch (err) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Whitelist check (same as your previous logic)
    if (
      !allowedFiles.includes(file) &&
      !file.endsWith(".ts") // allow all .ts segments (for HLS)
    ) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // TS segment proxy (for HLS streaming)
    if (file.endsWith(".ts")) {
      const FOLDER = "pbic7i";
      const tsFileName = file;
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${tsFileName}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      if (!username || !password) {
        return new Response("Server misconfiguration", { status: 500, headers: corsHeaders });
      }
      const basic = Buffer.from(`${username}:${password}`).toString("base64");
      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const tsRes = await fetch(videoUrl, { headers: fetchHeaders });
      if (!tsRes.ok || !tsRes.body) {
        return new Response("Segment not found", { status: 404, headers: corsHeaders });
      }
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", getContentType(tsFileName));
      if (tsRes.headers.get("content-length")) headers.set("Content-Length", tsRes.headers.get("content-length")!);
      if (tsRes.headers.get("content-range")) headers.set("Content-Range", tsRes.headers.get("content-range")!);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");
      return new Response(tsRes.body, { status: tsRes.status, headers });
    }

    // Main video/playlist proxy (mp4 or m3u8)
    const FOLDER = "pbic7i";
    const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${encodeURIComponent(file)}`;
    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    if (!username || !password) {
      return new Response("Server misconfiguration", { status: 500, headers: corsHeaders });
    }
    const basic = Buffer.from(`${username}:${password}`).toString("base64");
    const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
    const range = req.headers.get("range");
    if (range) fetchHeaders.Range = range;

    const videoRes = await fetch(videoUrl, { headers: fetchHeaders });
    if (!videoRes.ok || !videoRes.body) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length")) headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range")) headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err: unknown) {
    console.error("secure-video2 proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}