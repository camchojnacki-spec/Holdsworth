import { Storage } from "@google-cloud/storage";

const BUCKET_NAME = "holdsworth-card-photos";
const storage = new Storage();
const bucket = storage.bucket(BUCKET_NAME);

/**
 * Upload a base64 data URL to GCS and return the public URL.
 * Generates a unique filename based on cardId + type + timestamp.
 */
export async function uploadCardPhoto(
  dataUrl: string,
  cardId: string,
  photoType: "front" | "back"
): Promise<{ url: string; thumbnailUrl?: string }> {
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
  const filename = `cards/${cardId}/${photoType}-${timestamp}.${ext}`;

  const file = bucket.file(filename);
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000",
    },
  });

  const url = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;

  return { url };
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
