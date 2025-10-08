export const config = { runtime: "edge" };

// --- CORS helper ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // For production, set to your static site's domain for security!
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

export async function OPTIONS() {
  // Pre-flight CORS handler
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url!);
  const file = searchParams.get("file");
  if (!file) {
    return new Response(JSON.stringify({ error: "Missing file" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Whitelisted videos
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
  ];
  if (!allowedFiles.includes(file)) {
    return new Response(JSON.stringify({ error: "Invalid file" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // ----- (Optional) Firebase ID Token verification -----
  // If you want to enforce Firebase login, uncomment below and make sure you have firebase-admin set up!
  /*
  import { initializeApp, cert, getApps } from "firebase-admin/app";
  import { getAuth } from "firebase-admin/auth";
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId: "...", clientEmail: "...", privateKey: "..." }) });
  }
  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : null;
  if (!idToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }
  try {
    await getAuth().verifyIdToken(idToken);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 403, headers: corsHeaders });
  }
  */
  // ------------------------------------------------------

  // Auth for your protected folder (HTTP Basic Auth)
  const username = process.env.VIDEO_SERVER_USER || "Razor7";
  const password = process.env.VIDEO_SERVER_PASS || "S1M3o;OY}ixq";
  const basic = btoa(`${username}:${password}`);

  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
  };
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  // Actually fetch the video
  const videoRes = await fetch(videoUrl, { headers });

  if (!videoRes.ok || !videoRes.body) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Set all relevant streaming headers + CORS
  const headersOut: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
  };
  if (videoRes.headers.get("content-length")) {
    headersOut["Content-Length"] = videoRes.headers.get("content-length")!;
  }
  if (videoRes.headers.get("content-range")) {
    headersOut["Content-Range"] = videoRes.headers.get("content-range")!;
  }

  return new Response(videoRes.body, {
    status: videoRes.status,
    headers: headersOut,
  });
}