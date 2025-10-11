export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { NextRequest } from "next/server";

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

// Only paid courses go here (do NOT include demo)
const allowedCourses = ["powerbi", "python", "databricks", "snowflake"];

// --- PUBLIC DEMO WHITELIST ---
function isWhitelistedDemoPlaylist(courseId: string, lessonId: string | number, ext: string) {
  if (courseId !== "demo") return false;
  const lessonNum = Number(lessonId);
  return Number.isInteger(lessonNum) && lessonNum >= 1 && lessonNum <= 20 && ext === ".m3u8";
}
function isWhitelistedDemoSegment(tsFileName: string) {
  // demo1_0000.ts ... demo20_9999.ts
  return /^demo([1-9]|1\d|20)_.+\.ts$/.test(tsFileName);
}

function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
  if (!allowedCourses.includes(courseId)) return false;
  const lessonNum = Number(lessonId);
  if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 20) return false;
  if (![".m3u8", ".mp4"].includes(ext)) return false;
  return true;
}

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
    const { pathname, searchParams } = req.nextUrl;

    // --- TS Segment Proxy ---
    if (pathname.endsWith(".ts")) {
      const tsFileName = pathname.split("/").pop();
      if (!tsFileName) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      // PUBLIC: demo1_*.ts ... demo20_*.ts
      if (isWhitelistedDemoSegment(tsFileName)) {
        const FOLDER = "pbic7i"; // cPanel folder
        const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${tsFileName}`;
        const username = process.env.CPANEL_USERNAME!;
        const password = process.env.CPANEL_PASSWORD!;
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
      // --- ALL OTHER SEGMENTS REQUIRE TOKEN ---
      let token = searchParams.get("token");
      if (!token) {
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      try {
        await getAuth().verifyIdToken(token);
      } catch {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      const FOLDER = "pbic7i";
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${tsFileName}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
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

    // --- Playlist / MP4 Proxy ---
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    let token = searchParams.get("token");

    // Try to get token from Authorization header if not present in query
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    // PUBLIC: demo1..demo20.m3u8 (playlist) does NOT need token
    if (isWhitelistedDemoPlaylist(courseId, lessonId, ext)) {
      const FOLDER = "pbic7i";
      const file = `${FOLDER}/${courseId}${lessonId}${ext}`;
      const videoUrl = `https://www.richdatatech.com/videos/${file}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
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
    }

    // --- ALL OTHERS REQUIRE TOKEN ---
    if (!courseId || !lessonId || !token) {
      return new Response("Missing parameters", { status: 400, headers: corsHeaders });
    }

    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });
    }

    try {
      await getAuth().verifyIdToken(token);
    } catch (err) {
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
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}