import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// --- Firebase Admin Init (unchanged) ---
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Allowed origins - keep the list you trust
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
  console.log("🔍 CORS Debug - Received origin:", origin);
  console.log("🔍 CORS Debug - Allowed origins:", allowedOrigins);
  
  // Check if origin is in allowed list
  const isAllowed = origin && allowedOrigins.includes(origin);
  console.log("🔍 CORS Debug - Origin allowed:", isAllowed);
  
  // Use the requesting origin if allowed, otherwise use a safe fallback
  const safeOrigin = isAllowed ? origin : allowedOrigins[0];
  console.log("🔍 CORS Debug - Safe origin:", safeOrigin);
  
  const headers = {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Range, X-Requested-With",
    "Access-Control-Max-Age": "600",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  } as Record<string, string>;
  
  console.log("🔍 CORS Debug - Headers being sent:", headers);
  return headers;
}

// Helpers (same logic as your original)
function isPublicPlaylist(courseId: string, lessonId: string | number, ext: string) {
  const n = Number(lessonId);
  return courseId === "demo" && Number.isInteger(n) && n >= 1 && n <= 100 && ext === ".m3u8";
}
function isPublicSegment(tsFileName: string) {
  return /^demo([1-9]|[1-9][0-9]|100)_.+\.ts$/.test(tsFileName);
}
function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
  if (!courseId || typeof courseId !== "string") return false;
  const lessonNum = Number(lessonId);
  if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 100) return false;
  if (![".m3u8", ".mp4"].includes(ext)) return false;
  return true;
}
function getContentType(file: string) {
  if (file.endsWith(".mp4")) return "video/mp4";
  if (file.endsWith(".m3u8")) return "application/x-mpegURL";
  if (file.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}
async function rewritePlaylistWithToken(playlistRes: Response, token: string) {
  const playlistText = await playlistRes.text();
  const tokenParam = `token=${token}`;
  // Append token to every .ts segment URI if not present
  return playlistText.replace(
    /([a-zA-Z0-9_\-\/\.]+\.ts)(\?[^ \n\r]*)?/g,
    (match, p1, p2) => {
      if (p2 && p2.includes('token=')) return match;
      // Preserve any path segments; we'll rely on client rewriting to point at /api/secure-video3/<seg>
      return `${p1}${p2 ? p2 + '&' : '?'}${tokenParam}`;
    }
  );
}

// OPTIONS handler - always return CORS headers and 204
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  console.log("🔍 OPTIONS request from origin:", origin);
  const headers = getCorsHeaders(origin);
  console.log("🔍 OPTIONS response headers:", headers);
  return new Response(null, { status: 204, headers });
}

// GET handler - handles both playlist and .ts segment proxied requests
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  console.log("🔍 GET request from origin:", origin);
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { pathname, searchParams } = req.nextUrl;

    // If the request is for a .ts segment (catch-all route puts segment into pathname)
    if (pathname.endsWith(".ts")) {
      const tsFileName = pathname.split("/").pop();
      if (!tsFileName) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      const isFreeSegment = isPublicSegment(tsFileName);

      // If not public, require token (either query token or Authorization header)
      if (!isFreeSegment) {
        let token = searchParams.get("token");
        if (!token) {
          const authHeader = req.headers.get("authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
        }
        if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        try {
          await getAuth().verifyIdToken(token);
        } catch (err) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
      }

      // Proxy the .ts file from your protected origin (Basic auth)
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

    // Otherwise treat it as a playlist / mp4 proxy
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    let token = searchParams.get("token");

    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
    }

    const isFreePlaylist = isPublicPlaylist(courseId, lessonId, ext);

    if (!isFreePlaylist) {
      if (!token) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      try {
        await getAuth().verifyIdToken(token);
      } catch (err) {
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

    // If this is a protected m3u8, rewrite TS references to include token so client can proxy them
    if (ext === ".m3u8" && !isFreePlaylist) {
      // Ensure token exists
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      const rewrittenPlaylist = await rewritePlaylistWithToken(videoRes, token);
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", "application/x-mpegURL");
      headers.set("Cache-Control", "no-store");
      return new Response(rewrittenPlaylist, { status: 200, headers });
    }

    // Otherwise pass-through (public playlist or mp4)
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length")) headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range")) headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}