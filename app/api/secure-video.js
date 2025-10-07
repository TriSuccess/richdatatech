res.setHeader("Access-Control-Allow-Origin", "*"); // Or your domain
res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
import admin from "firebase-admin";

// Only initialize once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    storageBucket: "course2-f1bdb.appspot.com",
  });
}
const bucket = admin.storage().bucket();

export default async (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).send("Missing file parameter");

  const gcsFile = bucket.file(`videos/${file}`);

  // Check if file exists
  const [exists] = await gcsFile.exists();
  if (!exists) return res.status(404).send("File not found");

  try {
    // Get file metadata for size
    const [metadata] = await gcsFile.getMetadata();
    const fileSize = parseInt(metadata.size, 10);

    let range = req.headers.range;
    if (range) {
      // Example: "bytes=0-"
      const bytesPrefix = "bytes=";
      if (range.startsWith(bytesPrefix)) {
        let [startStr, endStr] = range.substring(bytesPrefix.length).split("-");
        let start = parseInt(startStr, 10);
        let end = endStr ? parseInt(endStr, 10) : fileSize - 1;
        if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
          res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
          return;
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", end - start + 1);
        res.setHeader("Content-Type", "video/mp4");
        gcsFile.createReadStream({ start, end })
          .on('error', (err) => res.status(500).end("Stream error"))
          .pipe(res);
        return;
      }
    }

    // No range header: send whole file
    res.status(200);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    gcsFile.createReadStream()
      .on('error', (err) => res.status(500).end("Stream error"))
      .pipe(res);

  } catch (err) {
    res.status(500).send("Error streaming video");
  }
};