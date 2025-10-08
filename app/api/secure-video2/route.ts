import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("file");
  if (!filename) {
    return new NextResponse("Missing file parameter", { status: 400 });
  }

  // Validate file/folder if needed
  // For simplicity, this demo just fetches directly from your domain
  const remoteUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(filename)}`;

  const videoRes = await fetch(remoteUrl);
  if (!videoRes.ok) {
    return new NextResponse("Video not found", { status: 404 });
  }

  // Stream the video to the client
  return new NextResponse(videoRes.body, {
    status: 200,
    headers: {
      "Content-Type": videoRes.headers.get("Content-Type") || "video/mp4",
      "Content-Length": videoRes.headers.get("Content-Length") || "",
      "Accept-Ranges": "bytes",
    },
  });
}