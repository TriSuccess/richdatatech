import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  return Response.json({ url: "https://example.com/video.mp4" });
}