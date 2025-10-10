// ...[imports and setup unchanged]...

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { searchParams } = req.nextUrl;
    const courseId = searchParams.get("courseId") || "";
    const lessonId = searchParams.get("lessonId") || "";
    const ext = searchParams.get("ext") || ".m3u8";
    const token = searchParams.get("token");

    if (!courseId || !lessonId || !token) {
      console.log("Missing parameters:", { courseId, lessonId, token });
      return new Response("Missing parameters", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Validate course and lesson
    if (!isValidCourseAndLesson(courseId, lessonId, ext)) {
      console.log("Invalid course or lesson:", { courseId, lessonId, ext });
      return new Response("Invalid course or lesson", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Verify Firebase ID token
    try {
      await getAuth().verifyIdToken(token);
    } catch (err) {
      console.log("Token verification failed:", err);
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Only the backend constructs the path!
    const FOLDER = "pbic7i";
    const file = `${FOLDER}/${courseId}${lessonId}${ext}`;
    const videoUrl = `https://www.richdatatech.com/videos/${file}`;

    // cPanel Basic Auth
    const username = process.env.CPANEL_USERNAME!;
    const password = process.env.CPANEL_PASSWORD!;
    const basic = Buffer.from(`${username}:${password}`).toString("base64");

    // Log the outgoing fetch
    console.log("Proxying video request to:", videoUrl);
    console.log("Using username:", username);

    // Proxy the video/HLS file (with Range, for streaming support)
    const fetchHeaders: Record<string, string> = {
      Authorization: `Basic ${basic}`,
    };
    const range = req.headers.get("range");
    if (range) fetchHeaders.Range = range;

    const videoRes = await fetch(videoUrl, {
      headers: fetchHeaders,
    });

    // Log the response from the upstream server
    console.log(`Upstream response: ${videoRes.status} ${videoRes.statusText}`);
    if (!videoRes.ok) {
      const errorBody = await videoRes.text();
      console.log("Upstream error body:", errorBody);
      return new Response("Video not found", { status: 404, headers: corsHeaders });
    }

    // Compose headers
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", getContentType(file));
    if (videoRes.headers.get("content-length"))
      headers.set("Content-Length", videoRes.headers.get("content-length")!);
    if (videoRes.headers.get("content-range"))
      headers.set("Content-Range", videoRes.headers.get("content-range")!);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "no-store");

    return new Response(videoRes.body, {
      status: videoRes.status,
      headers,
    });
  } catch (err: unknown) {
    console.error("secure-video proxy error:", err);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
}