// Force Node.js runtime for streaming & Firebase Admin
export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ---- Firebase Admin init ----
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ---- Allowed Origins ----
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

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

// ---- Utility helpers ----
function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

const allowedCourses = ["powerbi", "python", "databricks", "snowflake"];

// ---- OPTIONS (CORS preflight) ----
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// ---- GET: handle .m3u8, .ts, or ?courseId= ----
export async function GET(req: NextRequest, { params }: { params: { file?: string[] } }) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { searchParams } = req.nextUrl;
    const fileParts = params.file || [];

    // ====== Case 1: /api/secure-video/<filename>.m3u8 or .ts ======
    if (fileParts.length > 0) {
      const fileName = fileParts.join("/");
      const FOLDER = "pbic7i";
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${fileName}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      const basic = Buffer.from(`${username}:${password}`).toString("base64");

      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const upstream = await fetch(videoUrl, { headers: fetchHeaders });
      if (!upstream.ok || !upstream.body) {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", getContentType(fileName));
      if (upstream.headers.get("content-length"))
        headers.set("Content-Length", upstream.headers.get("content-length")!);
      if (upstream.headers.get("content-range"))
        headers.set("Content-Range", upstream.headers.get("content-range")!);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");

      return new Response(upstream.body, { status: upstream.status, headers });
    }

    // ====== Case 2: /api/secure-video?courseId=... ======
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    const token = searchParams.get("token");

    if (!courseId || !lessonId || !token)
      return new Response("Missing parameters", { status: 400, headers: corsHeaders });

    if (!allowedCourses.includes(courseId))
      return new Response("Invalid course", { status: 403, headers: corsHeaders });

    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const FOLDER = "pbic7i";
    const file = `${FOLDER}/${courseId}${lessonId}${ext}`;
    const videoUrl = `https://www.richdatatech.com/videos/${file}`;

    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
    const range = req.headers.get("range");
    if (range) fetchHeaders.Range = range;

    const upstream = await fetch(videoUrl, { headers: fetchHeaders });
    if (!upstream.ok || !upstream.body)
      return new Response("Video not found", { status: 404, headers: corsHeaders });

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
    if (upstream.headers.get("content-length"))
      headers.set("Content-Length", upstream.headers.get("content-length")!);
    if (upstream.headers.get("content-range"))
      headers.set("Content-Range", upstream.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}
