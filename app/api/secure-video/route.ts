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

// Allowed course IDs
const allowedCourses = ["powerbi", "python", "databricks", "snowflake"];

// Preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// Validate lesson id and course id
function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
  if (!allowedCourses.includes(courseId)) return false;
  const lessonNum = Number(lessonId);
  if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 20) return false; // adjust max lessons
  if (![".m3u8", ".mp4"].includes(ext)) return false;
  return true;
}

// Content-Type for streaming
function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

// GET handler: secure proxy for HLS/MP4
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { searchParams } = req.nextUrl;
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    const token = searchParams.get("token");

    // Logging incoming parameters
    console.log("Request parameters:", { courseId, lessonId, ext, token: token ? "[present]" : "[missing]" });

    if (!courseId || !lessonId || !token) {
      console.log("Missing parameters", { courseId, lessonId, token });
      return new Response("Missing parameters", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Validate course and lesson
    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      console.log("Invalid course or lesson", { courseId, lessonId, ext });
      return new Response("Invalid course or lesson", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Verify Firebase ID token
    try {
      await getAuth().verifyIdToken(token);
    } catch (err) {
      console.log("Token verification failed", err);
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Only the backend constructs the path!
    const FOLDER = "pbic7i";
    const file = `${FOLDER}/${courseId}${lessonId}${ext}`;

    // cPanel Basic Auth
    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    // Build the video or HLS file URL
    const videoUrl = `https://www.richdatatech.com/videos/${file}`;

    // Log fetch attempt
    console.log("Proxying request to upstream:", videoUrl, "with username:", username);

    // Proxy the video/HLS file (with Range, for streaming support)
    const fetchHeaders: Record<string, string> = {
      Authorization: `Basic ${basic}`,
    };
    const range = req.headers.get("range");
    if (range) fetchHeaders.Range = range;

    // Log headers sent to upstream
    console.log("Upstream fetch headers:", fetchHeaders);

    const videoRes = await fetch(videoUrl, {
      headers: fetchHeaders,
    });

    // Log the response from upstream
    console.log(`Upstream response: ${videoRes.status} ${videoRes.statusText}`);
    if (!videoRes.ok || !videoRes.body) {
      const errorBody = await videoRes.text().catch(() => "[unavailable]");
      console.log("Upstream error body:", errorBody);
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

    // Log successful proxy
    console.log("Proxying upstream response with status:", videoRes.status);

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers,
    });
  } catch (err: unknown) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}