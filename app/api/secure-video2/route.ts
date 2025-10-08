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
    return new NextResponse(
      JSON.stringify({ error: "Missing file parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Allow powerbi1-8.mp4 and python1-8.mp4
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`)
  ];

  if (!allowedFiles.includes(file)) {
    return new NextResponse(
      JSON.stringify({ error: "Invalid file" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  return new NextResponse(
    JSON.stringify({ url }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}