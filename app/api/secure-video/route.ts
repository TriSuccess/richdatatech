import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  // Replace this with your real Firebase Storage link:
  const videoUrl = "https://firebasestorage.googleapis.com/v0/b/course2-f1bdb.firebasestorage.app/o/videos%2Fpaid_2.mp4?alt=media";
  return new NextResponse(
    JSON.stringify({ url: videoUrl }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}