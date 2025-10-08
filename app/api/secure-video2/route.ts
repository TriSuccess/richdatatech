// No need for NextResponse for binary streaming!
export const config = { runtime: "edge" };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url!);
  const file = searchParams.get("file");
  if (!file) return new Response(JSON.stringify({ error: "Missing file" }), { status: 400 });

  // (Optional) Firebase Auth - skip this block if you want to test without!
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  // You can skip Firebase verification for initial debugging
  // If you want to keep it, ensure your Firebase Admin SDK is working on Vercel

  // Whitelist files
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
  ];
  if (!allowedFiles.includes(file)) {
    return new Response(JSON.stringify({ error: "Invalid file" }), { status: 403 });
  }

  // Auth for your protected folder
  const username = process.env.VIDEO_SERVER_USER || "Razor7";
  const password = process.env.VIDEO_SERVER_PASS || "S1M3o;OY}ixq";
  const basic = btoa(`${username}:${password}`);

  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

  // Pass range only if present
  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
  };
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  // Actually fetch the video
  const videoRes = await fetch(videoUrl, { headers });

  if (!videoRes.ok || !videoRes.body) {
    return new Response(JSON.stringify({ error: "Video not found" }), { status: 404 });
  }

  // Set all relevant streaming headers
  const headersOut: Record<string, string> = {
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