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

// ✅ Handle POST requests (main endpoint)
export async function POST(req: NextRequest) {
  try {
    // 🔹 Parse request JSON
    const { file } = await req.json(); // removed uid (not used)

    if (!file) {
      return new Response("Missing file", { status: 400 });
    }

    // 🔹 Verify Firebase token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    // 🔹 Allow only specific files
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      "databricks1.mp4",
    ];

    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403 });
    }

    // 🔹 Basic Auth credentials
    const username = "Razor7"; // ⚠️ Hardcoded
    const password = "S1M3o;OY}ixq"; // ⚠️ Hardcoded
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    // 🔹 Check video accessibility
    const head = await fetch(videoUrl, {
      method: "HEAD",
      headers: { Authorization: `Basic ${basic}` },
    });

    if (!head.ok) {
      return new Response("Video not found", { status: 404 });
    }

    // 🔹 Return the secure video URL
    return new Response(JSON.stringify({ url: videoUrl }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: unknown) {
    // ✅ Safe error handling
    const message = err instanceof Error ? err.message : String(err);
    console.error("secure-video error:", message);
    return new Response("Server error", { status: 500 });
  }
}
