import { Storage } from "@google-cloud/storage";
import sharp from "sharp";

const BUCKET_NAME = "holdsworth-card-photos";
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

interface UploadResult {
  url: string;
  displayUrl: string;
  thumbnailUrl: string;
}

/**
 * Upload a file buffer to GCS and return the public URL.
 */
async function uploadToGcs(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const file = bucket.file(filename);
  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
    },
  });
  return `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;
}

/**
 * Upload a base64 data URL to GCS with optimized variants.
 * Generates 3 sizes: thumbnail (200px), display (800px), and original.
 * Falls back to uploading the original if sharp processing fails.
 */
export async function uploadCardPhoto(
  dataUrl: string,
  cardId: string,
  photoType: "front" | "back"
): Promise<UploadResult> {
  // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL format");
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(base64Data, "base64");
  const timestamp = Date.now();

  // Upload original
  const originalFilename = `cards/${cardId}/${photoType}-${timestamp}-original.${ext}`;
  const originalUrl = await uploadToGcs(buffer, originalFilename, mimeType);

  try {
    // Generate optimized variants with sharp
    const [thumbnailBuffer, displayBuffer] = await Promise.all([
      sharp(buffer)
        .resize(200, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer(),
      sharp(buffer)
        .resize(800, undefined, { withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
    ]);

    const [thumbnailUrl, displayUrl] = await Promise.all([
      uploadToGcs(
        thumbnailBuffer,
        `cards/${cardId}/${photoType}-${timestamp}-thumb.webp`,
        "image/webp"
      ),
      uploadToGcs(
        displayBuffer,
        `cards/${cardId}/${photoType}-${timestamp}-display.webp`,
        "image/webp"
      ),
    ]);

    return { url: originalUrl, displayUrl, thumbnailUrl };
  } catch (err) {
    console.error("[uploadCardPhoto] Sharp processing failed, using original for all sizes:", err);
    return { url: originalUrl, displayUrl: originalUrl, thumbnailUrl: originalUrl };
  }
}

/**
 * Delete all photos for a card from GCS.
 */
export async function deleteCardPhotos(cardId: string): Promise<void> {
  try {
    await bucket.deleteFiles({ prefix: `cards/${cardId}/` });
  } catch {
    // Non-critical — photos may not exist
  }
}
