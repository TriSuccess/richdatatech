import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const file = searchParams.get("file");
  if (!file) {
    return new Response("Missing file parameter", { status: 400 });
  }

  // Only allow specific files!
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`)
  ];
  if (!allowedFiles.includes(file)) {
    return new Response("Invalid file", { status: 403 });
  }

  // Fetch the protected video from your server (use credentials if needed)
  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  const videoRes = await fetch(videoUrl, {
    // Uncomment and set these if your server uses HTTP Basic Auth!
    // headers: {
    //   Authorization: 'Basic ' + Buffer.from('username:password').toString('base64'),
    // }
  });

  if (!videoRes.ok) {
    return new Response("Video not found", { status: 404 });
  }

  // Set headers for video streaming
  return new Response(videoRes.body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      // Pass through content length and range headers if needed:
      ...(videoRes.headers.get("content-length") ? { "Content-Length": videoRes.headers.get("content-length")! } : {}),
      ...(videoRes.headers.get("content-range") ? { "Content-Range": videoRes.headers.get("content-range")! } : {}),
    }
  });
}