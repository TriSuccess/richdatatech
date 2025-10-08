export async function POST(req: NextRequest) {
  // ...auth checks as before...
  const { file, productId } = await req.json();
  // Only allow files in this array
  const allowedFiles = [
    "databricks1.mp4", "databricks2.mp4", "databricks3.mp4",
    "databricks4.mp4", "databricks5.mp4", "databricks6.mp4",
    "databricks7.mp4", "databricks8.mp4", "databricks9.mp4", "databricks10.mp4"
  ];
  if (!allowedFiles.includes(file)) {
    return new NextResponse(JSON.stringify({ error: "Invalid file" }), { status: 403 });
  }
  // Firestore user check as before...
  // For productId "paid1", check purchases.paid1, etc.
  const paid = userDoc.data()?.purchases?.[productId];
  if (!paid) return NextResponse.json({ error: "Not paid" }, { status: 403 });
  // Serve video
  const url = `https://www.richdatatech.com/videos/pbic7i/${encodeURIComponent(file)}`;
  return NextResponse.json({ url });
}