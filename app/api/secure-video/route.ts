import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

// ✅ Initialize Firebase Admin once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// ✅ Allowed Origins (desktop + mobile)
const allowedOrigins = [
  "https://course2-f1bdb.web.app",
  "https://www.course2-f1bdb.web.app",
  "http://localhost:3000",
];

// ✅ Strongly typed function for headers
function getCorsHeaders(origin?: string): Record<string, string> {
  const safeOrigin =
    allowedOrigins.includes(origin ?? "") ? origin! : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ✅ Handle OPTIONS (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}

// ✅ Handle POST request — verify + stream video
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { file } = await req.json();
    if (!file) {
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    // 🔹 Verify Firebase ID Token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
