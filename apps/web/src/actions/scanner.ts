"use server";

import {
  scanCardWithGemini,
  detectCardBounds,
  identifyWithCandidates,
  detectParallelConstrained,
  type CardScanResponse,
  type CardCropRegion,
} from "@/lib/ai/gemini";
import { extractCardText } from "@/lib/ai/text-extraction";
import {
  matchAgainstReference,
  applyReferenceCorrections,
  multiPassReferenceLookup,
  type ReferenceLookupResult,
} from "@/lib/ai/reference-matcher";
import { db, scanSessions, setImportAttempts } from "@holdsworth/db";
import { eq, and, ilike } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

export interface ScanActionResult {
  success: boolean;
  data?: CardScanResponse & { _aiCorrected?: boolean; _referenceCardId?: string; _subsetOrInsert?: string | null };
  bounds?: CardCropRegion | null;
  backBounds?: CardCropRegion | null;
  error?: string;
  processingTimeMs?: number;
  _pipeline?: string; // debugging: which pipeline path was taken
}

/**
 * Batch scan variant — same pipeline as scanCard but without the per-call rate limit.
 * The batch processor on the client handles its own pacing (1 card per 2-3 seconds).
 */
export async function batchScanCard(formData: FormData): Promise<ScanActionResult> {
  return scanCardInternal(formData, /* skipRateLimit */ true);
}

export async function scanCard(formData: FormData): Promise<ScanActionResult> {
  return scanCardInternal(formData, /* skipRateLimit */ false);
}

async function scanCardInternal(formData: FormData, skipRateLimit: boolean): Promise<ScanActionResult> {
  const startTime = Date.now();

  // Rate limit: 10 scans per minute (skipped for batch mode which self-paces)
  if (!skipRateLimit) {
    const rl = rateLimit("scan", 10, 60_000);
    if (!rl.success) {
      return { success: false, error: "Too many requests. Please wait a moment." };
    }
  }

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

    // ═══════════════════════════════════════════════════════
    // PARALLEL: Stage 1 (text extraction) + bounding box detection
    // ═══════════════════════════════════════════════════════
    console.log("[scanner] Starting multi-pass pipeline...");

    const [textExtraction, bounds, backBounds] = await Promise.all([
      extractCardText(frontBase64, frontType, backBase64, backMimeType),
      detectCardBounds(frontBase64, frontType),
      backBase64 ? detectCardBounds(backBase64, backMimeType!) : Promise.resolve(null),
    ]);

    console.log("[scanner] Stage 1 complete — text extraction + bounds done");

    // ═══════════════════════════════════════════════════════
    // Stage 2: Reference DB lookup using extracted text
    // ═══════════════════════════════════════════════════════
    const refLookup: ReferenceLookupResult = await multiPassReferenceLookup(textExtraction);
    console.log(`[scanner] Stage 2 complete — lookup type: ${refLookup.type}, matches: ${refLookup.matches.length}`);

    let aiResult: CardScanResponse;
    let pipelinePath: string;

    if (refLookup.type === "exact") {
      // ═══════════════════════════════════════════════════════
      // EXACT MATCH: Skip full vision call, use reference data directly
      // ═══════════════════════════════════════════════════════
      pipelinePath = "exact-match";
      const match = refLookup.matches[0];
      console.log(`[scanner] Exact match path — skipping full identification for ${match.productName}`);

      // Build a high-confidence result from reference data + text extraction
      aiResult = {
        player_name: textExtraction.playerNameAsWritten ?? "",
        team: "",
        position: null,
        year: textExtraction.copyrightYear ?? 0,
        set_name: match.correctedSetName,
        subset_or_insert: match.subsetName,
        card_number: textExtraction.cardNumber ?? "",
        manufacturer: textExtraction.manufacturerText ?? "",
        parallel_variant: null,
        serial_number: textExtraction.serialNumber ?? null,
        is_rookie_card: match.isRookieCard,
        is_prospect_card: false,
        is_autograph: match.isAutograph,
        is_relic: match.isRelic,
        is_short_print: match.isShortPrint,
        graded: false,
        grading_company: null,
        grade: null,
        cert_number: null,
        condition_estimate: "Near Mint",
        centering_estimate: "",
        condition_notes: "Condition not assessed — exact reference match used.",
        is_authentic: true,
        authenticity_notes: null,
        confidence: 0.95,
        identification_notes: `Identified via reference database exact match (${match.productName}).`,
      };

      // Stage 4: Constrained parallel detection
      if (refLookup.availableParallels && refLookup.availableParallels.length > 0) {
        console.log("[scanner] Running Stage 4 — constrained parallel detection");
        try {
          const parallelResult = await detectParallelConstrained(
            frontBase64,
            frontType,
            refLookup.availableParallels,
            textExtraction
          );
          if (parallelResult.parallelName) {
            aiResult.parallel_variant = parallelResult.parallelName;
            aiResult.identification_notes += ` Parallel: ${parallelResult.parallelName} (confidence: ${parallelResult.confidence.toFixed(2)}, evidence: ${parallelResult.evidence})`;
          }
        } catch (err) {
          console.warn("[scanner] Parallel detection failed, continuing without:", err);
        }
      }
    } else if (refLookup.type === "multiple") {
      // ═══════════════════════════════════════════════════════
      // MULTIPLE MATCHES: Use constrained visual identification
      // ═══════════════════════════════════════════════════════
      pipelinePath = "candidate-disambiguation";
      console.log(`[scanner] Candidate disambiguation path — ${refLookup.matches.length} candidates`);

      aiResult = await identifyWithCandidates(
        frontBase64,
        frontType,
        refLookup.matches,
        textExtraction,
        backBase64,
        backMimeType
      );

      // Stage 4: Constrained parallel detection
      if (refLookup.availableParallels && refLookup.availableParallels.length > 0) {
        console.log("[scanner] Running Stage 4 — constrained parallel detection");
        try {
          const parallelResult = await detectParallelConstrained(
            frontBase64,
            frontType,
            refLookup.availableParallels,
            textExtraction
          );
          if (parallelResult.parallelName) {
            aiResult.parallel_variant = parallelResult.parallelName;
            aiResult.identification_notes += ` Parallel detected: ${parallelResult.parallelName} (confidence: ${parallelResult.confidence.toFixed(2)}).`;
          }
        } catch (err) {
          console.warn("[scanner] Parallel detection failed, continuing without:", err);
        }
      }
    } else {
      // ═══════════════════════════════════════════════════════
      // NO MATCH: Fall back to full vision identification (existing behavior)
      // ═══════════════════════════════════════════════════════
      pipelinePath = "full-identification";
      console.log("[scanner] No reference match — falling back to full AI identification");

      aiResult = await scanCardWithGemini(frontBase64, frontType, backBase64, backMimeType);
    }

    // B-025: Force identification explanation when confidence is low
    if (aiResult.confidence < 0.7 && (!aiResult.identification_notes || aiResult.identification_notes.trim().length < 10)) {
      aiResult.identification_notes = "Low confidence identification — the image may be blurry, poorly lit, or partially obscured. Try retaking the photo with better lighting and a clearer angle, or manually correct the fields above.";
    }

    // ── Reference matching: apply corrections (for candidate & full-ID paths) ──
    let finalResult: ScanActionResult["data"] = aiResult;
    if (refLookup.type === "exact") {
      // Already built from reference data — apply corrections format
      const match = refLookup.matches[0];
      finalResult = {
        ...aiResult,
        _aiCorrected: true,
        _referenceCardId: match.referenceCardId,
        _subsetOrInsert: match.subsetName,
      };
    } else {
      // For candidate-disambiguation and full-identification, run the legacy matcher
      const refMatch = await matchAgainstReference(aiResult);
      if (refMatch) {
        console.log(`[scanner] Reference match found: ${aiResult.card_number} → ${refMatch.correctedSetName} (${refMatch.subsetName || "base"})`);
        finalResult = await applyReferenceCorrections(aiResult, refMatch);
      } else {
        console.log(`[scanner] No reference match for ${aiResult.card_number} — using AI identification as-is`);
      }
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[scanner] Pipeline complete (${pipelinePath}) in ${processingTimeMs}ms`);

    // Record scan session for analytics
    try {
      await db.insert(scanSessions).values({
        status: "completed",
        photoUrl: "(stored-on-client)",
        aiProvider: "gemini",
        aiResponse: finalResult as unknown as Record<string, unknown>,
        confidenceScore: String(finalResult.confidence ?? 0),
        processingTimeMs,
      });
    } catch {
      // Non-critical — don't fail the scan if session recording fails
    }

    // ── Scan-triggered import (Sprint 2): queue TCDB import when reference DB misses ──
    // After the scan is complete, if no reference match was found but AI identified
    // a set name + year, queue a background import to grow the reference DB.
    if (pipelinePath === "full-identification" && finalResult.set_name && finalResult.year) {
      queueReferenceImportIfNeeded(finalResult.set_name, finalResult.year, finalResult.manufacturer ?? null)
        .catch(() => {}); // Fire-and-forget, don't block scan response
    }

    return {
      success: true,
      data: finalResult,
      bounds,
      backBounds,
      processingTimeMs,
      _pipeline: pipelinePath,
    };
  } catch (err) {
    const processingTimeMs = Date.now() - startTime;
    console.error("[scanCard] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error during scan";

    // Record failed scan session
    try {
      await db.insert(scanSessions).values({
        status: "failed",
        photoUrl: "(stored-on-client)",
        aiProvider: "gemini",
        aiResponse: { error: message },
        processingTimeMs,
      });
    } catch {
      // Non-critical
    }

    return {
      success: false,
      error: message,
      processingTimeMs,
    };
  }
}

/**
 * Queue a background reference DB import when a scan finds no reference match.
 * Checks set_import_attempts to avoid redundant TCDB searches for known failures.
 */
async function queueReferenceImportIfNeeded(
  setName: string,
  year: number,
  manufacturer: string | null
): Promise<void> {
  try {
    // Check if we've already tried and failed
    const [existing] = await db
      .select()
      .from(setImportAttempts)
      .where(
        and(
          ilike(setImportAttempts.setName, `%${setName}%`),
          eq(setImportAttempts.year, year)
        )
      )
      .limit(1);

    if (existing && existing.status === "not_found") {
      console.log(`[scanner] Skipping TCDB import for "${setName}" ${year} — previously not found`);
      return;
    }

    if (existing && existing.status === "imported") {
      console.log(`[scanner] "${setName}" ${year} already imported`);
      return;
    }

    // Record the attempt
    await db.insert(setImportAttempts).values({
      setName,
      year,
      manufacturer,
      status: "pending",
    });

    console.log(`[scanner] Queued reference import for "${setName}" ${year}`);

    // Try the import in-process (non-blocking to the scan response)
    try {
      const { importFromTcdb } = await import("@/actions/reference-import");
      // Search TCDB for this set (best effort)
      const result = await importFromTcdb({ productName: setName, year });

      await db
        .update(setImportAttempts)
        .set({
          status: result.success ? "imported" : "not_found",
          lastAttempted: new Date(),
          errorMessage: result.success ? null : result.error,
        })
        .where(
          and(
            ilike(setImportAttempts.setName, `%${setName}%`),
            eq(setImportAttempts.year, year)
          )
        );

      if (result.success) {
        console.log(`[scanner] Auto-imported "${setName}" ${year}: ${result.cardsUpserted} cards`);
      }
    } catch (importErr) {
      console.warn(`[scanner] Background import failed for "${setName}" ${year}:`, importErr);
    }
  } catch (err) {
    console.warn("[scanner] queueReferenceImportIfNeeded failed:", err);
  }
}
