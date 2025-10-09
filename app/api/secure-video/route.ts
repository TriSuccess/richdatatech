export const config = { runtime: "edge" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://course2-f1bdb.web.app", // Use your frontend domain for production!
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function POST(req: Request) {
  try {
    const { file } = await req.json();

    // Only allow the correct file(s) for security
    if (file !== "databricks1.mp4") {
      return new Response(JSON.stringify({ error: "Invalid file" }), {
        status: 403,
        headers: corsHeaders
      });
    }

    // Respond with your proxy URL for the video
    const url = `https://richdatatech.vercel.app/api/secure-video2?file=${encodeURIComponent(file)}`;
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: corsHeaders
    });
  }
}