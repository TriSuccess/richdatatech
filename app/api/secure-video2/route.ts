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

export async function POST(req: NextRequest) {
  const { file } = await req.json();
  if (!file) {
    return new NextResponse(JSON.stringify({ error: "Missing file parameter" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // Auth checks here if needed!
  const allowedFiles = ["powerbi1.mp4", "powerbi2.mp4"];
  if (!allowedFiles.includes(file)) {
    return new NextResponse(JSON.stringify({ error: "Invalid file" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const url = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  return new NextResponse(JSON.stringify({ url }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}