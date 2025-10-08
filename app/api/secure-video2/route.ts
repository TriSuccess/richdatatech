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
  const videoRes = await fetch(remoteUrl);
  if (!videoRes.ok) {
    return new NextResponse("Video not found", { status: 404, headers: corsHeaders });
  }
  return new NextResponse(videoRes.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": videoRes.headers.get("Content-Type") || "video/mp4",
      "Content-Length": videoRes.headers.get("Content-Length") || "",
      "Accept-Ranges": "bytes",
    },
  });
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