export const runtime = "nodejs";

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// --- Firebase Admin Init ---
if (!getApps().length) {
initializeApp({
credential: cert({
projectId: process.env.FIREBASE_PROJECT_ID!,
clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\n/g, "\n"),
}),
});
}

const allowedOrigins = [
"https://course2-f1bdb.web.app",
"https://www.course2-f1bdb.web.app",
"http://localhost:3000",
"http://localhost:3000",
"https://www.richdatatech.com",
];

function getCorsHeaders(origin?: string) {
const safeOrigin = allowedOrigins.includes(origin ?? "") ? origin : allowedOrigins[0];
return {
"Access-Control-Allow-Origin": safeOrigin,
"Access-Control-Allow-Methods": "GET, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type, Authorization",
} as Record<string, string>;
}

// --- PUBLIC/PROTECTED LOGIC ---
// Only demo1–demo100.m3u8 are public, everything else needs token
function isPublicPlaylist(courseId: string, lessonId: string | number, ext: string) {
const n = Number(lessonId);
return courseId === "demo" && Number.isInteger(n) && n >= 1 && n <= 100 && ext === ".m3u8";
}
// Only demo1_*.ts ... demo100_*.ts are public
function isPublicSegment(tsFileName: string) {
return /^demo([1-9]|[1-9][0-9]|100)_.+.ts$/.test(tsFileName);
}
// Accept any course, lesson 1–100, .m3u8/.mp4
function isValidCourseAndLesson(courseId: string, lessonId: string | number, ext: string) {
if (!courseId || typeof courseId !== "string") return false;
const lessonNum = Number(lessonId);
if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 100) return false;
if (![".m3u8", ".mp4"].includes(ext)) return false;
return true;
}

// --- Content-Type ---
function getContentType(file: string) {
if (file.endsWith(".mp4")) return "video/mp4";
if (file.endsWith(".m3u8")) return "application/x-mpegURL";
if (file.endsWith(".ts")) return "video/mp2t";
return "application/octet-stream";
}

// --- Playlist Rewrite: append token to all .ts lines ---
async function rewritePlaylistWithToken(playlistRes: Response, token: string) {
const playlistText = await playlistRes.text();
const tokenParam = token=${token};
// Append token to every .ts segment URI (if not already present)
return playlistText.replace(
/([a-zA-Z0-9_-]+.ts)(?[^ \n\r]*)?/g,
(match, p1, p2) => {
if (p2 && p2.includes('token=')) return match;
return ${p1}${p2 ? p2 + '&' : '?'}${tokenParam};
}
);
}

// --- OPTIONS handler ---
export async function OPTIONS(req: NextRequest) {
const origin = req.headers.get("origin") || "";
return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// --- GET handler ---
export async function GET(req: NextRequest) {
const origin = req.headers.get("origin") || "";
const corsHeaders = getCorsHeaders(origin);

try {
const { pathname, searchParams } = req.nextUrl;

} catch (err) {
console.error("secure-video proxy error:", err);
return new Response("Server error", { status: 500, headers: getCorsHeaders(origin) });
}
}