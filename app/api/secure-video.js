import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    storageBucket: "course2-f1bdb.appspot.com",
  });
}
const bucket = admin.storage().bucket();

export default async (req, res) => {
  const file = req.query.file; // e.g. paid_2.mp4
  if (!file) return res.status(400).send("Missing file parameter");

  // TODO: Add authentication/authorization logic here

  const gcsFile = bucket.file(`videos/${file}`);
  try {
    res.setHeader("Content-Type", "video/mp4");
    gcsFile.createReadStream().pipe(res);
  } catch (err) {
    res.status(500).send("Error streaming video");
  }
};