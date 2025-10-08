// pages/api/secure-video2.ts
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: "your-project-id",
      clientEmail: "your-service-account@your-project.iam.gserviceaccount.com",
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  const file = req.query.file;
  if (!file) return res.status(400).send("Missing file");

  // Verify Firebase ID Token from Authorization header
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  if (!idToken) return res.status(401).send("Unauthorized");

  try {
    await getAuth().verifyIdToken(idToken);
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(403).send("Invalid token");
  }

  // Whitelist files
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`)
  ];
  if (!allowedFiles.includes(file)) {
    return res.status(403).send("Invalid file");
  }

  // Basic Auth to protected external video server
  const username = "YOUR_USERNAME";
  const password = "YOUR_PASSWORD";
  const basic = Buffer.from(`${username}:${password}`).toString('base64');

  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  const videoRes = await fetch(videoUrl, {
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  if (!videoRes.ok) {
    return res.status(404).send("Video not found");
  }

  // Pipe the response stream to client
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    ...(videoRes.headers.get("content-length") ? { "Content-Length": videoRes.headers.get("content-length") } : {}),
    ...(videoRes.headers.get("content-range") ? { "Content-Range": videoRes.headers.get("content-range") } : {}),
  });

  videoRes.body.pipe(res);
}
