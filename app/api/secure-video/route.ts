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

  // Only allow this specific file
  if (!file || file !== "databricks1.mp4") {
    return new Response("Invalid file", { status: 403, headers: corsHeaders });
  }

  // Use your exact domain and path
  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/databricks1.mp4`;
  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;

  // If protected by Basic Auth, uncomment and edit line below:
  // headers["Authorization"] = "Basic " + btoa("username:password");

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