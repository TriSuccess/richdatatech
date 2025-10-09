export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://course2-f1bdb.web.app", // your frontend origin
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Range",
};

// Preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function handleVideoRequest(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get("file");

    // Whitelist file(s)
    if (!file || file !== "databricks1.mp4") {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    // ---- Basic Auth ----
    const username = "Razor7"; // ⚠️ Change this or use env vars
    const password = "S1M3o;OY}ixq"; // ⚠️ Change this or use env vars
    const basic = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
    const headers: Record<string, string> = { Authorization: basic };

    // Forward Range header for video streaming
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    const videoRes = await fetch(videoUrl, { headers });

    if (!videoRes.ok || !videoRes.body) {
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // Build response headers
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Content-Type", videoRes.headers.get("Content-Type") || "video/mp4");

    const contentLength = videoRes.headers.get("Content-Length");
    const contentRange = videoRes.headers.get("Content-Range");

    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Video proxy error:", err);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
}

// ---- Support both GET and POST ----
export const GET = handleVideoRequest;
export const POST = handleVideoRequest;
