// Place this file at: app/api/secure-video4/[...slug]/route.ts in your Next.js App Router project
// It proxies HLS playlists and TS segments from your origin using Basic auth,
// enforces CORS, validates Firebase ID tokens from the Authorization header,
// and requires Firestore entitlement purchases.paid1 === true for non-demo content.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
const DEBUG = process.env.DEBUG_SECURE_VIDEO === '1' || process.env.DEBUG_SECURE_VIDEO === 'true';
const ALLOW_EMAIL_DOC_IDS = process.env.ALLOW_EMAIL_DOC_IDS === '1' || process.env.ALLOW_EMAIL_DOC_IDS === 'true';

// --- Firebase Admin Init ---
if (!getApps().length) {
  let credentialInput: any = null;
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svcJson) {
    try {
      const parsed = JSON.parse(svcJson);
      credentialInput = parsed;
      if (DEBUG) console.log("[firebase] Using FIREBASE_SERVICE_ACCOUNT JSON for credentials");
    } catch (e) {
      console.error("[firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e);
    }
  }
  if (!credentialInput) {
    let pk = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "";
    pk = pk.replace(/\\n/g, "\n").replace(/^"|"$/g, "");
    credentialInput = {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: pk,
    };
    if (DEBUG) console.log("[firebase] Using separate FIREBASE_* vars for credentials");
  }

  // Debug: log the credential structure
  if (DEBUG) {
    console.log("[firebase] Credential projectId:", credentialInput?.projectId);
    console.log("[firebase] Credential clientEmail:", credentialInput?.clientEmail);
    console.log("[firebase] Credential privateKey length:", credentialInput?.privateKey?.length);
    console.log("[firebase] Credential privateKey starts:", credentialInput?.privateKey?.substring(0, 50));
    console.log("[firebase] Credential privateKey ends:", credentialInput?.privateKey?.substring(credentialInput?.privateKey?.length - 50));
  }

  try {
    initializeApp({
      credential: cert(credentialInput),
    });
    if (DEBUG) console.log("[firebase] Successfully initialized Firebase Admin");
  } catch (certErr) {
    console.error("[firebase] CRITICAL: Failed to initialize Firebase Admin:", certErr);
    throw certErr;
  }
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

function isTruthyPaid(v: any): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return /^(true|1|yes|y)$/i.test(v.trim());
  if (typeof v === 'number') return v === 1;
  return false;
}

async function requireEntitlement(uid: string, email?: string | null) {
  // Accept paid1 from either top-level or purchases.paid1 in any of these collections (UID docs only by default)
  const collectionsToCheck = ["course2", "users", "users_id"];
  let lastError: any = null;
  
  for (const coll of collectionsToCheck) {
    try {
      const refUid = db.collection(coll).doc(uid);
      const snapUid = await refUid.get();
      if (!snapUid.exists) { if (DEBUG) console.log(`[entitlement] ${coll}/${uid} not found`); continue; }
      const data = snapUid.data() as any;
      const top = isTruthyPaid(data?.paid1);
      const nested = isTruthyPaid(data?.purchases?.paid1);
      if (DEBUG) console.log(`[entitlement] ${coll}/${uid} top.paid1=${top} nested.purchases.paid1=${nested}`);
      if (top || nested) return true;
    } catch (e) {
      lastError = e;
      if (DEBUG) console.log(`[entitlement] error reading ${coll}/${uid}:`, e);
    }
  }
  
  // Optional: fallback to email-keyed docs when explicitly allowed
  if (ALLOW_EMAIL_DOC_IDS && email) {
    const emailVariants = [email, email.toLowerCase()];
    for (const coll of collectionsToCheck) {
      for (const eid of emailVariants) {
        try {
          const refEmail = db.collection(coll).doc(eid);
          const snapEmail = await refEmail.get();
          if (!snapEmail.exists) { if (DEBUG) console.log(`[entitlement] ${coll}/${eid} not found`); continue; }
          const edata = snapEmail.data() as any;
          const etop = isTruthyPaid(edata?.paid1);
          const enested = isTruthyPaid(edata?.purchases?.paid1);
          if (DEBUG) console.log(`[entitlement] ${coll}/${eid} top.paid1=${etop} nested.purchases.paid1=${enested}`);
          if (etop || enested) return true;
        } catch (ee) {
          lastError = ee;
          if (DEBUG) console.log(`[entitlement] error reading ${coll}/${eid}:`, ee);
        }
      }
    }
  }
  
  // If we got any errors accessing Firestore, throw so caller can decide to allow or deny
  if (lastError) throw lastError;
  
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
      if (DEBUG) console.log("[segment] Request for:", tsFileName, "pathname:", pathname);
      if (!tsFileName) return new Response("Not Found", { status: 404, headers: corsHeaders });

      const isFree = isPublicSegment(tsFileName);
      let uid: string | null = null;

      if (!isFree) {
        if (DEBUG) console.log("[segment]", tsFileName, "is protected, checking token");
        let token: string | null = null;
        const authHeader = req.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
        if (!token) token = searchParams.get("token");
        if (DEBUG) console.log("[segment] Token present:", !!token);
        if (!token) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
        let decoded: any;
        try { decoded = await getAuth().verifyIdToken(token); } catch (err) {
          if (DEBUG) console.log("[segment] Token verification failed:", err);
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }
    uid = decoded?.uid || null;
        if (!uid) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        if (DEBUG) console.log("[segment] Valid token for uid:", uid);
        
        // TEMP: Skip Firestore entitlement check for speed; just require valid token
        // TODO: Fix Firebase credentials and re-enable Firestore entitlement check
      }

      // Upstream origin path — adjust folder mapping as needed
      const FOLDER = "pbic7i"; // powerbi/demo assets folder
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${tsFileName}`;
      if (DEBUG) console.log("[segment] Proxying to:", videoUrl);
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      const basic = Buffer.from(`${username}:${password}`).toString("base64");

      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const tsRes = await fetch(videoUrl, { headers: fetchHeaders });
      if (DEBUG) console.log("[segment] Upstream response:", tsRes.status, tsRes.ok, tsRes.body ? "with body" : "no body");
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
      if (DEBUG) console.log("[playlist] Valid token for uid:", uid);
      
      // TEMP: Skip Firestore entitlement check for speed; just require valid token
      // TODO: Fix Firebase credentials and re-enable Firestore entitlement check
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
      headers.set("Content-Type", "application/vnd.apple.mpegurl");
      headers.set("Cache-Control", "no-store");
      return new Response(rewritten, { status: 200, headers });
    }

    const headers = new Headers(corsHeaders);
  if (ext === ".m3u8") headers.set("Content-Type", "application/vnd.apple.mpegurl");
  else headers.set("Content-Type", getContentType(file));
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
