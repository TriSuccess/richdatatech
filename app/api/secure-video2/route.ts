import type { NextApiRequest, NextApiResponse } from "next";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fetch from "node-fetch"; // ensure you have node-fetch installed if using Node < 18

// ---- Initialize Firebase Admin ----
if (!getApps().length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin environment variables");
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error) {
    console.error("Firebase Admin initialization failed:", error);
  }
}

// ---- API Handler ----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const file = req.query.file as string;
    if (!file) return res.status(400).send("Missing file");

    // Verify Firebase ID token
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;

    if (!idToken) return res.status(401).send("Unauthorized");

    try {
      await getAuth().verifyIdToken(idToken);
    } catch (err) {
      console.error("Token verification failed:", err);
      return res.status(403).send("Invalid token");
    }

    // Allowlisted videos
    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
    ];

    if (!allowedFiles.includes(file)) {
      return res.status(403).send("Invalid file");
    }

    // ---- Fetch the video from external server ----
    const username = process.env.VIDEO_SERVER_USER || "YOUR_USERNAME";
    const password = process.env.VIDEO_SERVER_PASS || "YOUR_PASSWORD";
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
    const videoRes = await fetch(videoUrl, {
      headers: {
        Authorization: `Basic ${basic}`,
        Range: req.headers.range || "",
      },
    });

    if (!videoRes.ok || !videoRes.body) {
      return res.status(404).send("Video not found or failed to load");
    }

    // ---- Stream video ----
    res.writeHead(videoRes.status, {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      ...(videoRes.headers.get("content-length") ? { "Content-Length": videoRes.headers.get("content-length") } : {}),
      ...(videoRes.headers.get("content-range") ? { "Content-Range": videoRes.headers.get("content-range") } : {}),
    });

    videoRes.body.pipe(res);
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).send("Internal Server Error");
  }
}
