// Place this file at: app/api/secure-video4/[...slug]/route.ts in your Next.js App Router project
// It proxies HLS playlists and TS segments from your origin using Basic auth,
// enforces CORS, validates Firebase ID tokens from the Authorization header,
// and requires Firestore entitlement purchases.paid1 === true for non-demo content.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// --- Firebase Admin Init ---
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

// Allowed origins you trust
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
  "http://localhost:8000",
  "https://www.richdatatech.com",
  "http://172.20.10.10:8000",
  "https://richdatatech.com",
  "https://richdatatech.vercel.app",
];

function getCorsHeaders(origin?: string) {
  const isAllowed = origin && allowedOrigins.includes(origin);
  const safeOrigin = isAllowed ? origin! : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Range, X-Requested-With",
    "Access-Control-Max-Age": "600",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  } as Record<string, string>;
}

function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

function isPublicPlaylist(courseId: string, lessonId: string | number, ext: string) {
  const n = Number(lessonId);
  return courseId === "demo" && Number.isInteger(n) && n >= 1 && n <= 100 && ext === ".m3u8";
}
function isPublicSegment(tsFileName: string) {
  // demo1_0000.ts etc.
  return /^demo([1-9]|[1-9][0-9]|100)_.+\.ts$/.test(tsFileName);
}
function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
  if (!courseId || typeof courseId !== "string") return false;
  const lessonNum = Number(lessonId);
  if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 100) return false;
  if (![".m3u8", ".mp4"].includes(ext)) return false;
  return true;
}

async function rewritePlaylistWithToken(playlistRes: Response, token: string) {
  const playlistText = await playlistRes.text();
  const tokenParam = `token=${token}`;
  // Append token to every .ts segment URI if not already present
  return playlistText.replace(
    /([a-zA-Z0-9_\-\/\.]+\.ts)(\?[^ \n\r]*)?/g,
    (match, p1, p2) => {
      if (p2 && p2.includes('token=')) return match;
      return `${p1}${p2 ? p2 + '&' : '?'}${tokenParam}`;
    }
  );
}

async function requireEntitlement(uid: string) {
  // Accept purchases.paid1 === true from one of these collections
  const collectionsToCheck = ["course2", "users", "users_id"];
  for (const coll of collectionsToCheck) {
    try {
      const ref = db.collection(coll).doc(uid);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data() as any;
      const purchases = data?.purchases || {};
      if (purchases && purchases.paid1 === true) return true;
    } catch (e) {
      // ignore and continue next collection
    }
  }
  return false;
}

// OPTIONS handler
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const headers = getCorsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

// GET handler handles both playlist and .ts segment requests
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { pathname, searchParams } = req.nextUrl;

    // Segment proxy: /api/secure-video4/<tsFile>
    if (pathname.endsWith(".ts")) {
      const tsFileName = pathname.split("/").pop();
      if (!tsFileName) return new Response("Not Found", { status: 404, headers: corsHeaders });

      const isFree = isPublicSegment(tsFileName);
      let uid: string | null = null;

      if (!isFree) {
        let token: string | null = null;
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
        if (!token) token = searchParams.get("token");
        if (!token) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        let decoded: any;
        try { decoded = await getAuth().verifyIdToken(token); } catch {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        uid = decoded?.uid || null;
        if (!uid) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

        const entitled = await requireEntitlement(uid);
        if (!entitled) return new Response("Payment required", { status: 402, headers: corsHeaders });
      }

      // Upstream origin path — adjust folder mapping as needed
      const FOLDER = "pbic7i"; // powerbi/demo assets folder
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

    // Playlist / mp4 proxy
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";

    const isFreePlaylist = isPublicPlaylist(courseId, lessonId, ext);
    let uid: string | null = null;
    let token: string | null = null;

    if (!isFreePlaylist) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
      if (!token) token = searchParams.get("token");
      if (!token) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      let decoded: any;
      try { decoded = await getAuth().verifyIdToken(token); } catch {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      uid = decoded?.uid || null;
      if (!uid) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const entitled = await requireEntitlement(uid);
      if (!entitled) return new Response("Payment required", { status: 402, headers: corsHeaders });
    }

    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });
    }

    // Map course to upstream folder if needed
    const FOLDER = "pbic7i"; // adjust per course if you add new folders
    const file = `${FOLDER}/${courseId}${lessonId}${ext}`; // e.g., pbic7i/powerbi1.m3u8
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

    // If protected m3u8 and token exists, rewrite TS references to include token query for wider compatibility
    if (ext === ".m3u8" && !isFreePlaylist && token) {
      const rewritten = await rewritePlaylistWithToken(videoRes, token);
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", "application/x-mpegURL");
      headers.set("Cache-Control", "no-store");
      return new Response(rewritten, { status: 200, headers });
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length")) headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range")) headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err) {
    console.error("secure-video4 error:", err);
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}
