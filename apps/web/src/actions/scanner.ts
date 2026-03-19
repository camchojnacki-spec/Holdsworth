"use server";

import { scanCardWithGemini, detectCardBounds, type CardScanResponse, type CardCropRegion } from "@/lib/ai/gemini";

export interface ScanActionResult {
  success: boolean;
  data?: CardScanResponse;
  bounds?: CardCropRegion | null;
  backBounds?: CardCropRegion | null;
  error?: string;
  processingTimeMs?: number;
}

export async function scanCard(formData: FormData): Promise<ScanActionResult> {
  const startTime = Date.now();

  try {
    const frontFile = formData.get("image") as File;
    const backFile = formData.get("backImage") as File | null;

    if (!frontFile || frontFile.size === 0) {
      return { success: false, error: "No image provided" };
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    // On mobile, blob type can be empty — default to jpeg for camera captures
    const frontType = validTypes.includes(frontFile.type) ? frontFile.type : "image/jpeg";
    if (frontFile.type && !validTypes.includes(frontFile.type)) {
      return { success: false, error: `Unsupported image format: ${frontFile.type}. Use JPEG, PNG, or WebP.` };
    }
    if (frontFile.size > 20 * 1024 * 1024) {
      return { success: false, error: "Image exceeds 20MB limit" };
    }

    // Convert front to base64
    const frontBuffer = await frontFile.arrayBuffer();
    const frontBase64 = Buffer.from(frontBuffer).toString("base64");

    // Convert back to base64 if provided
    let backBase64: string | undefined;
    let backMimeType: string | undefined;
    if (backFile && backFile.size > 0) {
      const backBuffer = await backFile.arrayBuffer();
      backBase64 = Buffer.from(backBuffer).toString("base64");
      backMimeType = validTypes.includes(backFile.type) ? backFile.type : "image/jpeg";
    }

    // Run identification (with optional back) and bounding box detection in parallel
    const promises: [
      Promise<CardScanResponse>,
      Promise<CardCropRegion | null>,
      Promise<CardCropRegion | null>,
    ] = [
      scanCardWithGemini(frontBase64, frontType, backBase64, backMimeType),
      detectCardBounds(frontBase64, frontType),
      backBase64 ? detectCardBounds(backBase64, backMimeType!) : Promise.resolve(null),
    ];

    const [result, bounds, backBounds] = await Promise.all(promises);
    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      data: result,
      bounds,
      backBounds,
      processingTimeMs,
    };
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error("[scanCard] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error during scan";
    return {
      success: false,
      error: message,
      processingTimeMs,
    };
  }
}
