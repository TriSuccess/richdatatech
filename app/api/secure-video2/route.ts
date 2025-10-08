export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // For production, set to your static site's domain
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url!);
  const file = searchParams.get("file");
  if (!file) {
    return new Response(JSON.stringify({ error: "Missing file" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Whitelisted videos
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
  ];
  if (!allowedFiles.includes(file)) {
    return new Response(JSON.stringify({ error: "Invalid file" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  // HTTP Basic Auth for your protected folder
  const username = process.env.VIDEO_SERVER_USER || "Razor7";
  const password = process.env.VIDEO_SERVER_PASS || "S1M3o;OY}ixq";
  const basic = btoa(`${username}:${password}`);

  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${basic}`,
  };
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  // Fetch with Range support
  const videoRes = await fetch(videoUrl, { headers });

  if (!videoRes.ok || !videoRes.body) {
    return new Response(JSON.stringify({ error: "Video not found" }), {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Stream status: use 206 if partial, else whatever upstream sends
  const status = videoRes.status;

  // Build response headers, passing through streaming/partial headers
  const headersOut: Record<string, string> = {
    ...corsHeaders,
    "Accept-Ranges": "bytes",
  };
  // Pass through these headers if present
  for (const h of ["Content-Type", "Content-Length", "Content-Range"]) {
    const val = videoRes.headers.get(h);
    if (val) headersOut[h] = val;
  }
  // Ensure Content-Type is set
  if (!headersOut["Content-Type"]) headersOut["Content-Type"] = "video/mp4";

  return new Response(videoRes.body, {
    status,
    headers: headersOut,
  });
}