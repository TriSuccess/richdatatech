export async function POST(req) {
  // For testing, just return something simple:
  return Response.json({ url: "https://example.com/video.mp4" });
}