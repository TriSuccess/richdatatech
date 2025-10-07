import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  // Handle preflight (CORS) requests
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // For development. Use your domain in production!
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function POST(req: NextRequest) {
  // Your logic goes here. This is just a test response:
  return new NextResponse(
    JSON.stringify({ url: "https://example.com/video.mp4" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}