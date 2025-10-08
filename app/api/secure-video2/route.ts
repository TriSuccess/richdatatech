import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

async function handleVideo(filename: string) {
  const allowedFiles = ["powerbi1.mp4", "powerbi2.mp4"];
  if (!allowedFiles.includes(filename)) {
    return new NextResponse("Invalid file", { status: 403, headers: corsHeaders });
  }
  const remoteUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(filename)}`;
  console.log("Fetching video from:", remoteUrl);
  const videoRes = await fetch(remoteUrl);

  if (!videoRes.ok) {
    console.log("Video fetch failed:", videoRes.status, videoRes.statusText);
    return new NextResponse("Video not found", { status: 404, headers: corsHeaders });
  }

  const contentType = videoRes.headers.get("Content-Type") || "video/mp4";
  let contentLength = videoRes.headers.get("Content-Length");
  try {
    const arrayBuffer = await videoRes.arrayBuffer();
    contentLength = String(arrayBuffer.byteLength);
    console.log("Fetched video, length:", contentLength);
    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": contentLength,
        "Accept-Ranges": "bytes",
      },
    });
  } catch (e) {
    console.log("Error buffering video:", e);
    return new NextResponse("Error buffering video", { status: 500, headers: corsHeaders });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("file");
  if (!filename) {
    return new NextResponse("Missing file parameter", { status: 400, headers: corsHeaders });
  }
  return handleVideo(filename);
}

export async function POST(req: NextRequest) {
  const { file } = await req.json();
  if (!file) {
    return new NextResponse("Missing file parameter", { status: 400, headers: corsHeaders });
  }
  return handleVideo(file);
}