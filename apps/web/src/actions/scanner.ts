"use server";

import { scanCardWithGemini, detectCardBounds, type CardScanResponse, type CardBoundingBox } from "@/lib/ai/gemini";

export interface ScanActionResult {
  success: boolean;
  data?: CardScanResponse;
  bounds?: CardBoundingBox | null;
  error?: string;
  processingTimeMs?: number;
}

export async function scanCard(formData: FormData): Promise<ScanActionResult> {
  const startTime = Date.now();

  try {
    const file = formData.get("image") as File;
    if (!file || file.size === 0) {
      return { success: false, error: "No image provided" };
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return { success: false, error: "Unsupported image format. Use JPEG, PNG, or WebP." };
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      return { success: false, error: "Image exceeds 20MB limit" };
    }

    // Convert to base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Run identification and bounding box detection in parallel
    const [result, bounds] = await Promise.all([
      scanCardWithGemini(base64, file.type),
      detectCardBounds(base64, file.type),
    ]);

    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      data: result,
      bounds,
      processingTimeMs,
    };
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error during scan";
    return {
      success: false,
      error: message,
      processingTimeMs,
    };
  }
}
