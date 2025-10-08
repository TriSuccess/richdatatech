export const config = {
  runtime: "edge",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url!);
  const file = searchParams.get("file");
  if (!file) {
    return new Response("Missing file parameter", { status: 400 });
  }

  // Only allow specific files!
  const allowedFiles = [
    ...Array.from({ length: 8 }, (_, i) => `powerbi${i + 1}.mp4`),
    ...Array.from({ length: 8 }, (_, i) => `python${i + 1}.mp4`)
  ];
  if (!allowedFiles.includes(file)) {
    return new Response("Invalid file", { status: 403 });
  }

  // HTTP Basic Auth credentials for your protected folder
  const username = "YOUR_USERNAME";
  const password = "YOUR_PASSWORD";
  const basic = btoa(username + ":" + password);

  // Fetch the protected video from your server
  const videoUrl = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  const videoRes = await fetch(videoUrl, {
    headers: {
      'Authorization': `Basic ${basic}`,
    }
  });

  if (!videoRes.ok) {
    return new Response("Video not found", { status: 404 });
  }

  return new Response(videoRes.body, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      ...(videoRes.headers.get("content-length") ? { "Content-Length": videoRes.headers.get("content-length")! } : {}),
      ...(videoRes.headers.get("content-range") ? { "Content-Range": videoRes.headers.get("content-range")! } : {}),
    }
  });
}