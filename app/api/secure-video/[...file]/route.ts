

import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

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

// Allowed origins
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
  };
}

const allowedCourses = ["powerbi", "python", "databricks", "snowflake"];

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
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

export async function GET(req: NextRequest, context: { params: { file?: string[] } }) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { params } = context;
    const filePath = params.file?.join("/"); // e.g., snowflake1_0000.ts

    const searchParams = req.nextUrl.searchParams;

    // Handle TS segments
    if (filePath && filePath.endsWith(".ts")) {
      const tsFileName = filePath.split("/").pop()!;
      const FOLDER = "pbic7i";
      const file = `${FOLDER}/${tsFileName}`;
      const videoUrl = `https://www.richdatatech.com/videos/${file}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      const basic = Buffer.from(`${username}:${password}`).toString("base64");

      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const tsRes = await fetch(videoUrl, { headers: fetchHeaders });
      if (!tsRes.ok || !tsRes.body)
        return new Response("Segment not found", { status: 404, headers: corsHeaders });

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", getContentType(tsFileName));
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");

      return new Response(tsRes.body, { status: tsRes.status, headers });
    }

    // Main video/playlist request
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    const token = searchParams.get("token");

    if (!courseId || !lessonId || !token)
      return new Response("Missing parameters", { status: 400, headers: corsHeaders });

    if (!isValidCourseAndLesson(courseId, lessonId, ext))
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });

    await getAuth().verifyIdToken(token);

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
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    console.error("secure-video error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}
