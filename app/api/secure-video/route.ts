export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // For production, use your frontend domain
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url!);
  const file = searchParams.get("file");

  // Only allow the specific file you want
  if (!file || file !== "databricks1.mp4") {
    return new Response("Invalid file", { status: 403, headers: corsHeaders });
  }

  // --- MANUALLY ENTER YOUR FOLDER USERNAME AND PASSWORD BELOW ---
  const username = "Razor7";
  const password = "S1M3o;OY}ixq";
  const basic = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  // The exact URL to your video file
  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/databricks1.mp4`;

  // Forward the Range header if present
  const headers: Record<string, string> = {
    Authorization: basic,
  };
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  const videoRes = await fetch(videoUrl, { headers });

  if (!videoRes.ok || !videoRes.body) {
    return new Response("Video not found", { status: 404, headers: corsHeaders });
  }

  // Copy streaming headers from the origin
  const status = videoRes.status;
  const headersOut: Record<string, string> = {
    ...corsHeaders,
    "Accept-Ranges": "bytes",
  };
  for (const h of ["Content-Type", "Content-Length", "Content-Range"]) {
    const val = videoRes.headers.get(h);
    if (val) headersOut[h] = val;
  }
  if (!headersOut["Content-Type"]) headersOut["Content-Type"] = "video/mp4";

  return new Response(videoRes.body, {
    status,
    headers: headersOut,
  });
}