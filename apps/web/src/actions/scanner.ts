"use server";

import { scanCardWithGemini, detectCardBounds, type CardScanResponse, type CardCropRegion } from "@/lib/ai/gemini";
import { matchAgainstReference, applyReferenceCorrections } from "@/lib/ai/reference-matcher";

export interface ScanActionResult {
  success: boolean;
  data?: CardScanResponse & { _aiCorrected?: boolean; _referenceCardId?: string; _subsetOrInsert?: string | null };
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
    const frontType = validTypes.includes(frontFile.type) ? frontFile.type : "image/jpeg";
    if (frontFile.type && !validTypes.includes(frontFile.type)) {
      return { success: false, error: `Unsupported image format: ${frontFile.type}. Use JPEG, PNG, or WebP.` };
    }
    if (frontFile.size > 20 * 1024 * 1024) {
      return { success: false, error: "Image exceeds 20MB limit" };
    }

    const frontBuffer = await frontFile.arrayBuffer();
    const frontBase64 = Buffer.from(frontBuffer).toString("base64");

    let backBase64: string | undefined;
    let backMimeType: string | undefined;
    if (backFile && backFile.size > 0) {
      const backBuffer = await backFile.arrayBuffer();
      backBase64 = Buffer.from(backBuffer).toString("base64");
      backMimeType = validTypes.includes(backFile.type) ? backFile.type : "image/jpeg";
    }

    // Run identification and bounding box detection in parallel
    const promises: [
      Promise<CardScanResponse>,
      Promise<CardCropRegion | null>,
      Promise<CardCropRegion | null>,
    ] = [
      scanCardWithGemini(frontBase64, frontType, backBase64, backMimeType),
      detectCardBounds(frontBase64, frontType),
      backBase64 ? detectCardBounds(backBase64, backMimeType!) : Promise.resolve(null),
    ];

    const [aiResult, bounds, backBounds] = await Promise.all(promises);

    // ── Reference matching: correct AI output against known cards ──
    let finalResult: ScanActionResult["data"] = aiResult;
    const refMatch = await matchAgainstReference(aiResult);
    if (refMatch) {
      console.log(`[scanner] Reference match found: ${aiResult.card_number} → ${refMatch.correctedSetName} (${refMatch.subsetName || "base"})`);
      finalResult = await applyReferenceCorrections(aiResult, refMatch);
    } else {
      console.log(`[scanner] No reference match for ${aiResult.card_number} — using AI identification as-is`);
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      success: true,
      data: finalResult,
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
