export const runtime = "nodejs"; // 🔧 Force Node.js environment

// ✅ Handle POST request — verify + stream video
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { file } = await req.json();
    if (!file) {
      return new Response("Missing file", { status: 400, headers: corsHeaders });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const idToken = authHeader.split("Bearer ")[1];
    await getAuth().verifyIdToken(idToken);

    const allowedFiles = [
      ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
      ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`),
      "databricks1.mp4",
    ];

    if (!allowedFiles.includes(file)) {
      return new Response("Invalid file", { status: 403, headers: corsHeaders });
    }

    const username = "Razor7";
    const password = "S1M3o;OY}ixq";
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;

    const headers: Record<string, string> = { Authorization: `Basic ${basic}` };
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    const videoRes = await fetch(videoUrl, {
      method: "GET",
      headers,
      redirect: "follow",
    });

    if (!videoRes.ok) {
      console.error("❌ Video fetch failed:", videoRes.status, videoRes.statusText);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set("Content-Type", "video/mp4");
    if (videoRes.headers.get("content-length"))
      responseHeaders.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range"))
      responseHeaders.set("Content-Range", videoRes.headers.get("content-range")!);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}
