import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("file");
  if (!filename) return new NextResponse("Missing file parameter", { status: 400 });

  // OPTIONAL: Check session, token, etc. Here you could check req.cookies or req.headers for auth
  // if (!isAuthenticated(req)) return new NextResponse("Unauthorized", { status: 401 });

  // Optionally validate filename to prevent path traversal!
  const allowedFiles = ["powerbi1.mp4", "powerbi2.mp4"];
  if (!allowedFiles.includes(filename)) return new NextResponse("Invalid file", { status: 403 });

  const remoteUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(filename)}`;
  const videoRes = await fetch(remoteUrl);
  if (!videoRes.ok) return new NextResponse("Video not found", { status: 404 });

  return new NextResponse(videoRes.body, {
    status: 200,
    headers: {
      "Content-Type": videoRes.headers.get("Content-Type") || "video/mp4",
      "Content-Length": videoRes.headers.get("Content-Length") || "",
      "Accept-Ranges": "bytes",
      // (optional) Add cache headers or remove as needed
    },
  });
}