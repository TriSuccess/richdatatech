/**
 * app/api/secure-video4/[...slug]/route.ts
 *
 * Secure HLS proxy for demo + paid content.
 * - Verifies Firebase ID token (from Authorization header or ?token=)
 * - Checks entitlement (purchases.paid1 === true) across common collections
 * - Proxies upstream .m3u8 and .ts files using Basic auth to upstream host
 * - Rewrites protected playlists so segment URLs go back to this proxy with token
 * - Returns appropriate CORS headers including exposed range headers
 *
 * Drop this file into your Next.js App Router `app/api/secure-video4/[...slug]/route.ts`
 * and deploy to Vercel. Ensure environment variables are set:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_SERVICE_ACCOUNT_KEY (with \n replaced as real newlines)
 * - CPANEL_USERNAME
 * - CPANEL_PASSWORD
 */

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

// Allowed origins you trust (adjust as needed)
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
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Range, X-Requested-With",
    "Access-Control-Max-Age": "600",
    "Access-Control-Allow-Credentials": "true",
    // Expose these headers so clients (HLS players) can read Content-Range / Length
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    Vary: "Origin",
  };
  return headers;
}

// Helpers
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

/**
 * Rewrite playlist so:
 * - Absolute upstream .ts URLs that point to upstreamBase are rewritten to
 *   proxy paths (/api/secure-video4/<filename>?token=...), ensuring the player
 *   requests segments through this server.
 * - Relative .ts URIs receive ?token=... appended if not present.
 *
 * Adjust upstreamBase if your original playlist references a different host/path.
 */
async function rewritePlaylistWithToken(playlistRes: Response, token: string) {
  const playlistText = await playlistRes.text();
  const tokenParam = `token=${encodeURIComponent(token)}`;

  // Upstream base used by the original playlists on your source host
  const upstreamBase = "https://www.richdatatech.com/videos/";

  // Replace any URI that ends with .ts (absolute or relative)
  const rewritten = playlistText.replace(/([^\s,]+?\.ts)(\?[^ \n\r]*)?/g, (match, uri, qs) => {
    // If token already present in the querystring, leave as-is
    if ((qs || "").includes("token=")) return match;

    // Try to detect absolute upstream references to rewrite them to proxy
    try {
      // Use upstreamBase as base so relative URIs can be parsed too
      const maybeUrl = new URL(uri, upstreamBase);
      if (maybeUrl.href.startsWith(upstreamBase)) {
        // Extract filename and rewrite to proxy endpoint
        const filename = maybeUrl.pathname.split("/").pop();
        if (filename) {
          // Proxy path that this route handles
          return `/api/secure-video4/${encodeURIComponent(filename)}?${tokenParam}`;
        }
      }
    } catch (e) {
      // ignore parse errors and treat as relative below
    }

    // Fallback: append token to relative URI
    return `${uri}${qs ? qs + "&" : "?"}${tokenParam}`;
  });

  return rewritten;
}

/**
 * Robust entitlement check:
 * - Check multiple common collections for an entry with doc id === uid
 * - Accept purchases.paid1 === true, data.paid1 === true, or entitlements.paid1 === true
 * - Log findings to Vercel logs for troubleshooting
 */
async function requireEntitlement(uid: string) {
  const collectionsToCheck = ["course2", "users", "users_id", "customers", "stripe_customers"];
  console.log(`[secure-video4] requireEntitlement: checking uid=${uid}`);
  for (const coll of collectionsToCheck) {
    try {
      const ref = db.collection(coll).doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        console.log(`[secure-video4] ${coll}/${uid} => NOT FOUND`);
        continue;
      }
      const data = snap.data() as any;
      console.log(`[secure-video4] ${coll}/${uid} => keys: ${Object.keys(data || {}).join(", ")}`);
      const purchases = data?.purchases || data?.metadata || data?.entitlements || data;
      // check multiple possible shapes
      if ((purchases && purchases.paid1 === true) || (data && data.paid1 === true) || (data?.entitlements?.paid1 === true)) {
        console.log(`[secure-video4] entitlement OK in ${coll}/${uid}`);
        return true;
      }
      // Also tolerate nested forms like { purchases: { "paid_1": true } } if necessary,
      // but prefer explicit paid1 key naming from the webhook.
    } catch (e) {
      console.warn(`[secure-video4] error checking ${coll}/${uid}:`, e);
    }
  }
  console.log(`[secure-video4] entitlement NOT FOUND for uid=${uid}`);
  return false;
}

// OPTIONS handler - return CORS headers for preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const headers = getCorsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

// GET handler - handles playlist (.m3u8), mp4 and .ts segment requests.
// Route is catch-all, so segments come in here as pathname ending with .ts.
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { pathname, searchParams } = req.nextUrl;

    // --- SEGMENT REQUEST ---
    if (pathname.endsWith(".ts")) {
      const parts = pathname.split("/");
      const tsFileName = parts.pop();
      if (!tsFileName) {
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      const isFree = isPublicSegment(tsFileName);
      let uid: string | null = null;

      if (!isFree) {
        // get token from query or Authorization header
        let token: string | null = searchParams.get("token");
        if (!token) {
          const authHeader = req.headers.get("authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
        }
        if (!token) {
          console.log(`[secure-video4] segment ${tsFileName} missing token/auth`);
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        // verify token and check entitlement
        let decoded: any;
        try {
          decoded = await getAuth().verifyIdToken(token);
          uid = decoded?.uid || null;
          console.log(`[secure-video4] segment token verified uid=${uid} file=${tsFileName}`);
        } catch (err) {
          console.warn("[secure-video4] segment token verification failed:", err);
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        if (!uid) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

        const entitled = await requireEntitlement(uid);
        if (!entitled) return new Response("Payment required", { status: 402, headers: corsHeaders });
      }

      // Proxy the .ts file from upstream protected host using Basic auth
      const FOLDER = "pbic7i"; // upstream folder on your origin
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${encodeURIComponent(tsFileName)}`;
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      const basic = Buffer.from(`${username}:${password}`).toString("base64");

      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const tsRes = await fetch(videoUrl, { headers: fetchHeaders });
      if (!tsRes.ok || !tsRes.body) {
        console.warn(`[secure-video4] failed fetching segment upstream ${videoUrl} status=${tsRes.status}`);
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

    // --- PLAYLIST / MP4 REQUEST ---
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";

    let token: string | null = searchParams.get("token");
    if (!token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
    }

    const isFreePlaylist = isPublicPlaylist(courseId, lessonId, ext);
    let uid: string | null = null;

    if (!isFreePlaylist) {
      if (!token) {
        console.log("[secure-video4] playlist request missing token/auth");
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
      let decoded: any;
      try {
        decoded = await getAuth().verifyIdToken(token);
        uid = decoded?.uid || null;
        console.log(`[secure-video4] playlist token verified uid=${uid} course=${courseId} lesson=${lessonId}`);
      } catch (err) {
        console.warn("[secure-video4] playlist token verification failed:", err);
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      if (!uid) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

      const entitled = await requireEntitlement(uid);
      if (!entitled) return new Response("Payment required", { status: 402, headers: corsHeaders });
    }

    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });
    }

    // Upstream file mapping
    const FOLDER = "pbic7i";
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
      console.warn(`[secure-video4] failed fetching upstream playlist/mp4 ${videoUrl} status=${videoRes.status}`);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // If protected m3u8, rewrite segments to proxy + token so the player always hits this proxy
    if (ext === ".m3u8" && !isFreePlaylist) {
      if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      const rewritten = await rewritePlaylistWithToken(videoRes, token);
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", "application/vnd.apple.mpegurl");
      headers.set("Cache-Control", "no-store");
      return new Response(rewritten, { status: 200, headers });
    }

    // Otherwise pass-through (public playlist or mp4)
    const headers = new Headers(corsHeaders);
    if (ext === ".m3u8") headers.set("Content-Type", "application/vnd.apple.mpegurl");
    else headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length")) headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range")) headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err) {
    console.error("[secure-video4] server error:", err);
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}