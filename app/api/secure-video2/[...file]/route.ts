export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

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

const allowedCourses = ["powerbi", "python", "databricks", "snowflake", "demo"];

// Utility: is string like "1"..."20"
function isPublicDemoLesson(lesson: string | number): boolean {
  const n = Number(lesson);
  return Number.isInteger(n) && n >= 1 && n <= 20;
}

// Whitelist: demo HLS playlists (demo1.m3u8 ... demo20.m3u8)
function isPublicPlaylist(courseId: string, lessonId: string | number, ext: string) {
  if (courseId === "demo" && isPublicDemoLesson(lessonId) && ext === ".m3u8") return true;
  if (courseId === "snowflake" && String(lessonId) === "1" && ext === ".m3u8") return true; // keep your old public snowflake1
  return false;
}

// Whitelist: demo segments (demo1_*.ts ... demo20_*.ts)
function isPublicSegment(tsFileName: string) {
  // demo1_0000.ts ... demo20_9999.ts
  const demoMatch = tsFileName.match(/^demo([1-9]|1\d|20)_.+\.ts$/);
  if (demoMatch) return true;
  // snowflake1_*.ts for legacy free
  if (tsFileName.startsWith("snowflake1_") && tsFileName.endsWith(".ts")) return true;
  return false;
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

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

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
      const isFreeSegment = isPublicSegment(tsFileName);

      if (!isFreeSegment) {
        // Require token for non-public segments
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

    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    // Allow free video playlist without token
    if (!isPublicPlaylist(courseId, lessonId, ext)) {
      // Require token for all other videos
      if (!token) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      try {
        await getAuth().verifyIdToken(token);
      } catch {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
    }

    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });
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
  } catch {
    console.error("secure-video2 proxy error");
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}