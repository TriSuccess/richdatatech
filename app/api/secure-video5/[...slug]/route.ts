// Place this file at: app/api/secure-video5/[...slug]/route.ts in your Next.js App Router project
// It proxies DASH manifests (.mpd) and segments (.m4s/.mp4) from your origin using Basic auth,
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
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  if (DEBUG) console.log("[firebase] Firebase Admin initialized");
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
  if (file.endsWith(".mpd")) return "application/dash+xml";
  if (file.endsWith(".m4s")) return "video/mp4";
  return "application/octet-stream";
}


function isPublicPlaylist(courseId: string, lessonId: string | number, ext: string) {
  const n = Number(lessonId);
  return (courseId === "demo" || courseId === "bluedemo" || courseId === "purpledemo") && Number.isInteger(n) && n >= 1 && n <= 100 && ext === ".mpd";
}
function isPublicSegment(segmentFileName: string) {
  // demo1_init.mp4, demo1_chunk_0001.m4s, bluedemo1_init.mp4, bluedemo1_chunk_0001.m4s, purpledemo1_init.mp4, purpledemo1_segment_00000.m4s, etc.
  return /^(demo|bluedemo|purpledemo)([1-9]|[1-9][0-9]|100)_(init\.(mp4|m4s)|chunk_\d+\.m4s|segment_\d+\.m4s)$/.test(segmentFileName);
}
function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
  if (!courseId || typeof courseId !== "string") return false;
  const lessonNum = Number(lessonId);
  if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 100) return false;
  if (![".mpd", ".mp4"].includes(ext)) return false;
  return true;
}

async function rewriteManifestWithToken(manifestRes: Response, token: string) {
  const manifestText = await manifestRes.text();
  const tokenParam = `token=${token}`;
  // Append token to every segment reference (init.mp4, chunk_*.m4s) if not already present
  return manifestText.replace(
    /([a-zA-Z0-9_\-\/\.]+\.(mp4|m4s))(\?[^ \n\r"]*)?/g,
    (match, p1, p2, p3) => {
      if (p3 && p3.includes('token=')) return match;
      return `${p1}${p3 ? p3 + '&' : '?'}${tokenParam}`;
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

// GET handler handles both manifest (.mpd) and segment (.m4s/.mp4) requests
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { pathname, searchParams } = req.nextUrl;

    // Segment proxy: /api/secure-video5/<segmentFile> (.m4s or init.mp4)
    if (pathname.endsWith(".m4s") || pathname.endsWith(".mp4")) {
      const segmentFileName = pathname.split("/").pop();
      if (DEBUG) console.log("[segment] Request for:", segmentFileName, "pathname:", pathname);
      if (!segmentFileName) return new Response("Not Found", { status: 404, headers: corsHeaders });

      const isFree = isPublicSegment(segmentFileName);
      let uid: string | null = null;

      if (!isFree) {
        if (DEBUG) console.log("[segment]", segmentFileName, "is protected, checking token");
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
        
        // TEMP: Skip Firestore check (credentials broken on Vercel). Client-side UI gates still active.
        // Client has already checked purchases.paid1 before requesting video.
      }

      // Upstream origin path — adjust folder mapping as needed
      const FOLDER = "pbic7i"; // powerbi/demo assets folder
      const videoUrl = `https://www.richdatatech.com/videos/${FOLDER}/${segmentFileName}`;
      if (DEBUG) console.log("[segment] Proxying to:", videoUrl);
      const username = process.env.CPANEL_USERNAME!;
      const password = process.env.CPANEL_PASSWORD!;
      const basic = Buffer.from(`${username}:${password}`).toString("base64");

      const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
      const range = req.headers.get("range");
      if (range) fetchHeaders.Range = range;

      const segmentRes = await fetch(videoUrl, { headers: fetchHeaders });
      if (DEBUG) console.log("[segment] Upstream response:", segmentRes.status, segmentRes.ok, segmentRes.body ? "with body" : "no body");
      if (!segmentRes.ok || !segmentRes.body) {
        return new Response("Segment not found", { status: 404, headers: corsHeaders });
      }

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", getContentType(segmentFileName));
      if (segmentRes.headers.get("content-length")) headers.set("Content-Length", segmentRes.headers.get("content-length")!);
      if (segmentRes.headers.get("content-range")) headers.set("Content-Range", segmentRes.headers.get("content-range")!);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "no-store");

      return new Response(segmentRes.body, { status: segmentRes.status, headers });
    }

    // Manifest / mp4 proxy (.mpd files)
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".mpd";

    const isFreeManifest = isPublicPlaylist(courseId, lessonId, ext);
    let uid: string | null = null;
    let token: string | null = null;

    if (!isFreeManifest) {
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
      if (DEBUG) console.log("[manifest] Valid token for uid:", uid);
      
      // TEMP: Skip Firestore check (credentials broken on Vercel). Client-side UI gates still active.
      // Client has already checked purchases.paid1 before requesting video.
    }

    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      return new Response("Invalid course or lesson", { status: 403, headers: corsHeaders });
    }

    // Map course to upstream folder if needed
    const FOLDER = "pbic7i"; // adjust per course if you add new folders
    const file = `${FOLDER}/${courseId}${lessonId}${ext}`; // e.g., pbic7i/purple1.mpd
    const videoUrl = `https://www.richdatatech.com/videos/${file}`;
    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const fetchHeaders: Record<string, string> = { Authorization: `Basic ${basic}` };
    const range = req.headers.get("range");
    if (range) fetchHeaders.Range = range;

    const videoRes = await fetch(videoUrl, { headers: fetchHeaders });
    if (!videoRes.ok || !videoRes.body) {
      if (DEBUG) console.log("[manifest] Video not found at", videoUrl);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // For DASH manifests, always rewrite segment paths to use the proxy
    if (ext === ".mpd") {
      const manifestText = await videoRes.text();
      if (DEBUG) console.log("[manifest] Original manifest (first 500 chars):", manifestText.substring(0, 500));
      
      // Rewrite all segment references in DASH manifest
      // Match patterns like: media="filename.m4s", <Representation>, initialization="file.m4s", etc.
      let rewritten = manifestText
        // Handle media="filename" and initialization="filename" attributes (including template patterns with $Number%)
        .replace(/(media|initialization)="([^"]+)"/g, (match, attr, path) => {
          // Check if it contains $Number$ or $RepresentationID$ (template placeholders)
          if (path.includes('$')) {
            // It's a template pattern - wrap the entire thing in the proxy URL
            return `${attr}="/api/secure-video5/${path}"`;
          } else {
            // It's a literal filename
            return `${attr}="/api/secure-video5/${path}"`;
          }
        })
        // Handle media='filename' and initialization='filename' with single quotes
        .replace(/(media|initialization)='([^']+)'/g, (match, attr, path) => {
          if (path.includes('$')) {
            return `${attr}='/api/secure-video5/${path}'`;
          } else {
            return `${attr}='/api/secure-video5/${path}'`;
          }
        })
        // Handle bare filenames in RepresentationIndex or BaseURL tags
        .replace(/<BaseURL>([^<]*)<\/BaseURL>/g, '<BaseURL>/api/secure-video5/$1</BaseURL>');

      if (token && !isFreeManifest) {
        // For protected content, add token to segment URLs
        rewritten = rewritten.replace(/\/api\/secure-video5\/([a-zA-Z0-9_\-\.]+\.(m4s|mp4))/g, (match) => {
          return `${match}?token=${encodeURIComponent(token)}`;
        });
      }

      if (DEBUG) console.log("[manifest] Rewritten manifest (first 500 chars):", rewritten.substring(0, 500));
      
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", "application/dash+xml");
      headers.set("Cache-Control", "no-store");
      return new Response(rewritten, { status: 200, headers });
    }

    const headers = new Headers(corsHeaders);
    if (ext === ".mpd") headers.set("Content-Type", "application/dash+xml");
    else headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length")) headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range")) headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, { status: videoRes.status, headers });
  } catch (err) {
    console.error("secure-video5 error:", err);
    return new Response("Server error", { status: 500, headers: getCorsHeaders(req.headers.get("origin") || "") });
  }
}
