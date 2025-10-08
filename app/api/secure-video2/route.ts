import { NextRequest, NextResponse } from "next/server";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin once globally
if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Missing Firebase Admin environment variables");
  } else {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

// 👇 This replaces `export default handler`
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  // Verify Firebase ID Token
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAuth().verifyIdToken(idToken);
  } catch (err) {
    console.error("Token verification failed:", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  // Whitelisted videos
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
  ];

  if (!allowedFiles.includes(file)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 403 });
  }

  // External video server auth
  const username = process.env.VIDEO_SERVER_USER || "Razor7";
  const password = process.env.VIDEO_SERVER_PASS || "S1M3o;OY}ixq";
  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

  const videoRes = await fetch(videoUrl, {
    headers: {
      Authorization: `Basic ${basic}`,
      Range: req.headers.get("range") || "",
    },
  });

  if (!videoRes.ok || !videoRes.body) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // Build the streaming response
  const headers = new Headers();
  headers.set("Content-Type", "video/mp4");
  headers.set("Accept-Ranges", "bytes");

  const contentLength = videoRes.headers.get("content-length");
  const contentRange = videoRes.headers.get("content-range");

  if (contentLength) headers.set("Content-Length", contentLength);
  if (contentRange) headers.set("Content-Range", contentRange);

  return new Response(videoRes.body, {
    status: videoRes.status,
    headers,
  });
}
