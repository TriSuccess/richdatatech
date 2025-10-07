import fetch from "node-fetch";

export default async function handler(req, res) {
  const { file } = req.query;
  if (!file) {
    res.status(400).send("Missing file parameter");
    return;
  }

  // The true location is hidden from the client!
  const videoUrl = `https://www.richdatatech.com/videos/${encodeURIComponent(file)}`;

  // Forward Range header for streaming/seek support in the browser
  const range = req.headers.range ? req.headers.range : undefined;

  // Fetch the video from the origin server
  const response = await fetch(videoUrl, {
    headers: range ? { Range: range } : {},
  });

  // Set status and headers for streaming (video seeking support)
  res.status(response.status);
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Stream the video data to the client
  response.body.pipe(res);
}