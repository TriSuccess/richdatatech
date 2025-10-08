import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Change to your domain for more security
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("file");
  if (!filename) {
    return new NextResponse("Missing file parameter", {
      status: 400,
      headers: corsHeaders,
    });
  }

  // OPTIONAL: Check session, token, etc. Here you could check req.cookies or req.headers for auth
  // if (!isAuthenticated(req)) return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });

  // Optionally validate filename to prevent path traversal!
  const allowedFiles = ["powerbi1.mp4", "powerbi2.mp4"];
  if (!allowedFiles.includes(filename)) {
    return new NextResponse("Invalid file", {
      status: 403,
      headers: corsHeaders,
    });
  }

  const remoteUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(filename)}`;
  const videoRes = await fetch(remoteUrl);

  if (!videoRes.ok) {
    return new NextResponse("Video not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Add CORS headers to the proxied response as well
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