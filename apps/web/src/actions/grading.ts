"use server";

import { db, cards, cardPhotos, priceEstimates } from "@holdsworth/db";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { GRADING_SYSTEM_PROMPT_V2 } from "@/lib/ai/prompts";

/**
 * AI Card Grading Engine — PSA-style condition assessment via Gemini Vision.
 *
 * Sprint 2 enhancements:
 *   B-039: Few-shot calibration with known PSA examples
 *   B-023: Autograph verification (ink/sticker/cut/facsimile)
 *   PR-009: Centering pre-analysis (dedicated border measurement)
 *   B-008: Graded vs raw price split + "Should I grade?" recommendation
 *   B-041: Configurable model (gemini-2.5-flash vs gemini-2.5-pro)
 */

export interface GradeReport {
  overallGrade: number;       // 1-10 scale (PSA equivalent)
  overallLabel: string;       // "Gem Mint 10", "Mint 9", etc.
  confidence: number;         // 0-100% confidence in the grade
  dimensions: {
    centering: {
      score: number;          // 1-10
      leftRight: string;      // e.g. "52/48"
      topBottom: string;      // e.g. "55/45"
      notes: string;
    };
    corners: {
      score: number;
      topLeft: string;        // "Sharp", "Slight touch", "Dinged"
      topRight: string;
      bottomLeft: string;
      bottomRight: string;
      notes: string;
    };
    edges: {
      score: number;
      top: string;            // "Clean", "Minor chipping", "Rough"
      bottom: string;
      left: string;
      right: string;
      notes: string;
    };
    surface: {
      score: number;
      scratches: string;      // "None visible", "Light", "Moderate"
      creases: string;
      staining: string;
      printDefects: string;
      notes: string;
    };
    printQuality: {
      score: number;
      registration: string;   // Color alignment
      focus: string;           // Image sharpness
      inkCoverage: string;     // Even ink distribution
      notes: string;
    };
    eyeAppeal: {
      score: number;
      notes: string;           // Overall visual presentation
    };
  };
  gradingNotes: string;        // Free-text summary of findings
  psaLikelihood: string;       // "If submitted to PSA, this card would likely receive..."
  photoQuality: string;        // "HD", "Good", "Low" — affects confidence
  timestamp: string;
  // B-023: Autograph verification
  autographAnalysis?: {
    type: string;              // "ink", "sticker", "cut", "facsimile", "none"
    placement: string;         // where on card
    quality: string;           // "bold", "light", "smudged", etc.
    authenticated: boolean;    // has certification marking
    notes: string;
  };
  // B-008: Graded vs raw price split
  gradedVsRaw?: {
    rawEstimateUsd: number;
    gradedEstimateUsd: number;
    gradingCostUsd: number;      // typical PSA submission cost
    netGradingBenefit: number;   // graded - raw - cost
    shouldGrade: boolean;
    recommendation: string;
  };
  // PR-009: Centering pre-analysis data
  centeringPreAnalysis?: {
    leftBorderPx: number;
    rightBorderPx: number;
    topBorderPx: number;
    bottomBorderPx: number;
    leftRightRatio: string;
    topBottomRatio: string;
    maxGradeForCentering: number;
  };
  // B-041: Which model was used
  modelUsed?: string;
}

const PSA_LABELS: Record<number, string> = {
  10: "Gem Mint",
  9: "Mint",
  8: "Near Mint-Mint",
  7: "Near Mint",
  6: "Excellent-Mint",
  5: "Excellent",
  4: "Very Good-Excellent",
  3: "Very Good",
  2: "Good",
  1: "Poor",
};

// ══════════════════════════════════════════
// B-039: Few-Shot Calibration Examples
// ══════════════════════════════════════════

const FEW_SHOT_EXAMPLES = `
## CALIBRATION EXAMPLES (known PSA grades — use these to calibrate your grading)

### Example 1: PSA 10 Gem Mint
Card: 2022 Topps Chrome Julio Rodriguez RC #200
- Centering: 50/50 LR, 51/49 TB — perfect
- Corners: All four razor sharp, zero wear
- Edges: All clean, no chipping whatsoever
- Surface: Pristine chrome finish, zero scratches, no print defects
- Eye Appeal: Stunning — card pops, perfect registration
→ PSA 10. This is the standard — anything less than this is NOT a 10.

### Example 2: PSA 8 NM-MT
Card: 2019 Topps Update Pete Alonso RC #US198
- Centering: 62/38 LR, 55/45 TB — noticeably off-center left
- Corners: Three sharp, one bottom-left has slight touch (barely visible)
- Edges: Top and right clean, left edge has two tiny white chips
- Surface: One very faint hairline scratch visible under angle lighting
- Eye Appeal: Good presentation despite the centering
→ PSA 8. The centering alone (62/38) limits this to PSA 8 territory. The minor edge chipping confirms it.

### Example 3: PSA 6 EX-MT
Card: 1987 Topps Barry Bonds RC #320
- Centering: 55/45 LR, 58/42 TB — acceptable
- Corners: Two sharp, one fuzzy, one slightly dinged
- Edges: Minor chipping on three edges, especially bottom
- Surface: Light wax stain on back, two hairline scratches on front
- Eye Appeal: Shows handling but still presentable
→ PSA 6. The dinged corner caps this at 6, and the surface issues confirm it. This is a "well-loved" card.

Use these examples to anchor your grading scale. A PSA 10 is RARE — most modern cards grade 8-9. Vintage cards (pre-2000) rarely grade above 8.
`;

// ══════════════════════════════════════════
// B-023: Autograph Verification Section
// ══════════════════════════════════════════

const AUTOGRAPH_SECTION = `
### 7. AUTOGRAPH ANALYSIS (if applicable)
If this card has ANY signature or autograph marking, classify it:
- **Type**:
  - "ink" — hand-signed directly on card surface with pen/marker
  - "sticker" — signed on a separate sticker label affixed to the card
  - "cut" — cut signature from another source, embedded in card
  - "facsimile" — printed/stamped signature (not hand-signed, part of card design)
  - "none" — no autograph present
- **Placement**: where on the card (e.g., "center front", "bottom right", "on sticker window")
- **Quality**: "bold and clear", "light/fading", "smudged", "bleeding ink", "partial"
- **Authenticated**: true if you see a "Certified Autograph Issue" label, hologram, or certification text
- Include this in your JSON output as "autographAnalysis"

IMPORTANT: A facsimile signature is NOT a real autograph — do not set is_autograph to true for facsimiles.
Sticker autos are less valuable than on-card ink autos — note this in your grading assessment.
`;

// ══════════════════════════════════════════
// PR-009: Centering Pre-Analysis Prompt
// ══════════════════════════════════════════

const CENTERING_PREANALYSIS_PROMPT = `Analyze the centering of this baseball card with extreme precision.

TASK: Measure the border widths on all four sides and calculate centering ratios.

INSTRUCTIONS:
1. Identify the card's printed area boundary (where the design meets the border)
2. Measure the border width on each side in relative pixel units
3. Calculate Left-Right ratio: left / (left + right), expressed as XX/YY
4. Calculate Top-Bottom ratio: top / (top + bottom), expressed as XX/YY
5. Determine the maximum PSA grade this centering allows:
   - 55/45 or better both ways → PSA 10 eligible
   - 60/40 or better both ways → PSA 9 eligible
   - 65/35 or better both ways → PSA 8 eligible
   - 70/30 or better both ways → PSA 7 eligible
   - Worse than 70/30 → PSA 6 or below

Return ONLY valid JSON (no markdown):
{
  "leftBorderPx": 0,
  "rightBorderPx": 0,
  "topBorderPx": 0,
  "bottomBorderPx": 0,
  "leftRightRatio": "50/50",
  "topBottomRatio": "50/50",
  "maxGradeForCentering": 10
}`;

const GRADING_PROMPT = `You are Holdsworth's AI Card Grading Engine — a professional-grade condition assessor trained on tens of thousands of PSA, BGS, and SGC graded cards.

Analyze this card photo with the precision of a professional grader. You are looking at a REAL physical card and must assess its condition honestly.

${FEW_SHOT_EXAMPLES}

## GRADING PROTOCOL

### 1. CENTERING (measure carefully)
- Estimate left-right border ratio (e.g., 52/48, 60/40, 70/30)
- Estimate top-bottom border ratio
- PSA 10 requires 55/45 or better in both directions
- PSA 9 allows 60/40 in one direction
- PSA 8 allows 65/35
- Anything worse than 70/30 caps the grade at 7 or below
- IMPORTANT: If centering pre-analysis data is provided below, use those exact measurements instead of estimating.

### 2. CORNERS (examine all four)
For each corner (top-left, top-right, bottom-left, bottom-right), assess:
- "Sharp" — perfect point, no wear
- "Slight touch" — barely detectable softening
- "Fuzzy" — visible softening but corner still pointed
- "Dinged" — noticeable wear, corner may be blunted
- "Bent/Creased" — structural damage
One fuzzy corner caps at PSA 8. One dinged corner caps at PSA 6.

### 3. EDGES (all four sides)
For each edge (top, bottom, left, right), assess:
- "Clean" — no visible chipping or wear
- "Minor chipping" — small white spots along the edge
- "Moderate wear" — consistent chipping or roughness
- "Heavy wear" — significant material loss
Any chipping caps at PSA 8. Moderate wear caps at PSA 6.

### 4. SURFACE
Assess each defect type:
- **Scratches**: "None visible", "Hairline (only under light)", "Light", "Moderate", "Deep"
- **Creases**: "None", "Hairline", "Light crease", "Heavy crease"
- **Staining**: "None", "Minor wax stain", "Yellowing", "Significant staining"
- **Print defects**: "None", "Minor dot", "Fish eye", "Off-registration color"
Any crease (even hairline) caps at PSA 8. A visible crease caps at PSA 5.

### 5. PRINT QUALITY
- **Registration**: Are the colors properly aligned? Any ghosting or offset?
- **Focus**: Is the image crisp or slightly soft?
- **Ink coverage**: Even distribution or thin spots/blobs?
Factory defects lower the grade but are noted as "OC" (off-center) or "PD" (print defect).

### 6. EYE APPEAL
- Overall visual impression at arm's length
- Does this card "pop" or does it look tired/handled?
- Consider the combination of all factors
${AUTOGRAPH_SECTION}

## PHOTO QUALITY ASSESSMENT
Before grading, assess the photo itself:
- "HD" — high resolution, good lighting, can see fine details and corners clearly
- "Good" — decent quality, can assess most features but fine details may be ambiguous
- "Low" — poor lighting/resolution, grading will have low confidence

If photo quality is "Low", your confidence should be below 50%.

## SCORING RULES
- Score each dimension 1-10 independently
- Overall grade = weighted average:
  - Centering: 15%
  - Corners: 25%
  - Edges: 20%
  - Surface: 25%
  - Print Quality: 10%
  - Eye Appeal: 5%
- BUT: the overall grade is CAPPED by the worst single dimension if it drops the grade significantly
  - If any dimension is ≤5, overall cannot exceed that dimension + 2
  - If any dimension is ≤3, overall cannot exceed that dimension + 1
- Round to nearest 0.5, then round to integer for final PSA-equivalent
- Be CONSERVATIVE — when in doubt, grade lower. Professional graders are strict.

## OUTPUT
Return ONLY valid JSON matching this exact schema (no markdown fences):

{
  "overallGrade": 8,
  "confidence": 75,
  "photoQuality": "Good",
  "dimensions": {
    "centering": {
      "score": 8,
      "leftRight": "55/45",
      "topBottom": "52/48",
      "notes": "Slightly off center to the left"
    },
    "corners": {
      "score": 9,
      "topLeft": "Sharp",
      "topRight": "Sharp",
      "bottomLeft": "Slight touch",
      "bottomRight": "Sharp",
      "notes": "All corners strong with minimal wear"
    },
    "edges": {
      "score": 8,
      "top": "Clean",
      "bottom": "Clean",
      "left": "Minor chipping",
      "right": "Clean",
      "notes": "Minor chipping visible on left edge"
    },
    "surface": {
      "score": 9,
      "scratches": "None visible",
      "creases": "None",
      "staining": "None",
      "printDefects": "None",
      "notes": "Clean surface with good gloss"
    },
    "printQuality": {
      "score": 8,
      "registration": "Good alignment",
      "focus": "Crisp",
      "inkCoverage": "Even",
      "notes": "Standard print quality for the set"
    },
    "eyeAppeal": {
      "score": 8,
      "notes": "Presents well, good centering helps overall appearance"
    }
  },
  "autographAnalysis": {
    "type": "none",
    "placement": "",
    "quality": "",
    "authenticated": false,
    "notes": "No autograph present"
  },
  "gradingNotes": "Summary of key findings...",
  "psaLikelihood": "If submitted to PSA, this card would likely receive a PSA 8 (NM-MT)."
}`;

// B-041: Default and available grading models
const GRADING_MODELS = {
  standard: "gemini-2.5-flash",
  premium: "gemini-2.5-pro",
} as const;

type GradingModel = keyof typeof GRADING_MODELS;

/** Optional multi-crop images generated client-side for enhanced grading. */
export interface GradingCropImages {
  fullImage?: string;       // base64 JPEG (no data: prefix)
  topLeft?: string;
  topRight?: string;
  bottomLeft?: string;
  bottomRight?: string;
  surfaceCenter?: string;
}

export async function gradeCard(
  cardId: string,
  model: GradingModel = "standard",
  crops?: GradingCropImages,
): Promise<GradeReport | null> {
  // Rate limit: 5 grades per minute
  const rl = rateLimit("grade", 5, 60_000);
  if (!rl.success) {
    throw new Error("Too many requests. Please wait a moment.");
  }

  // Import singleton Gemini client
  const { getGemini } = await import("@/lib/ai/gemini");
  const ai = getGemini();
  const modelId = GRADING_MODELS[model];

  // Get card photos
  const photos = await db
    .select({ originalUrl: cardPhotos.originalUrl, photoType: cardPhotos.photoType })
    .from(cardPhotos)
    .where(eq(cardPhotos.cardId, cardId));

  let frontUrl = photos.find((p) => p.photoType === "front")?.originalUrl;
  if (!frontUrl) frontUrl = photos[0]?.originalUrl ?? null;
  if (!frontUrl) {
    const [photo] = await db
      .select({ originalUrl: cardPhotos.originalUrl })
      .from(cardPhotos)
      .where(eq(cardPhotos.cardId, cardId))
      .limit(1);
    frontUrl = photo?.originalUrl ?? null;
  }
  if (!frontUrl) {
    throw new Error("No photo found for this card. Try re-scanning or uploading a photo.");
  }

  const backPhoto = photos.find((p) => p.photoType === "back");

  // Fetch front image
  const frontData = await fetchImageAsBase64(frontUrl);
  if (!frontData) {
    throw new Error("Could not load card photo. The image URL may be expired or inaccessible.");
  }

  // ══════════════════════════════════════════
  // PR-009: Centering Pre-Analysis (parallel call)
  // ══════════════════════════════════════════
  let centeringData: GradeReport["centeringPreAnalysis"] | undefined;
  try {
    const centeringResponse = await ai.models.generateContent({
      model: modelId,
      contents: [{
        role: "user",
        parts: [
          { text: CENTERING_PREANALYSIS_PROMPT },
          { inlineData: { mimeType: frontData.mimeType, data: frontData.data } },
        ],
      }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });
    const centeringText = centeringResponse.text ?? "";
    const centeringMatch = centeringText.match(/\{[\s\S]*\}/);
    if (centeringMatch) {
      centeringData = JSON.parse(centeringMatch[0]);
    }
  } catch (err) {
    console.error("[grading] Centering pre-analysis failed (non-fatal):", err);
  }

  // ══════════════════════════════════════════
  // Main Grading Call
  // ══════════════════════════════════════════
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Use v2 prompt with multi-crop protocol when crops are available, fall back to v1
  const hasCrops = crops && crops.topLeft && crops.topRight && crops.bottomLeft && crops.bottomRight && crops.surfaceCenter;
  let promptText = hasCrops ? GRADING_SYSTEM_PROMPT_V2 : GRADING_PROMPT;

  // Inject centering pre-analysis if available
  if (centeringData) {
    promptText += `\n\n## CENTERING PRE-ANALYSIS RESULTS (use these exact measurements)
Left-Right: ${centeringData.leftRightRatio} (left: ${centeringData.leftBorderPx}px, right: ${centeringData.rightBorderPx}px)
Top-Bottom: ${centeringData.topBottomRatio} (top: ${centeringData.topBorderPx}px, bottom: ${centeringData.bottomBorderPx}px)
Maximum PSA grade for centering: ${centeringData.maxGradeForCentering}`;
  }

  promptText += "\n\nAnalyze this card's condition. ";
  if (backPhoto?.originalUrl) {
    promptText += "Images provided include the FRONT and BACK. Grade the front primarily but note any back defects.";
  } else {
    promptText += "Only the front is provided. Note that back condition cannot be assessed.";
  }

  parts.push({ text: promptText });

  // If multi-crop images are available, send each with a label
  if (hasCrops) {
    parts.push({ text: "IMAGE 1 — Full card view (use for centering and overall eye appeal):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.fullImage || frontData.data } });

    parts.push({ text: "IMAGE 2 — Top-left corner crop at 2x zoom (use for corner grading):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.topLeft! } });

    parts.push({ text: "IMAGE 3 — Top-right corner crop at 2x zoom (use for corner grading):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.topRight! } });

    parts.push({ text: "IMAGE 4 — Bottom-left corner crop at 2x zoom (use for corner grading):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.bottomLeft! } });

    parts.push({ text: "IMAGE 5 — Bottom-right corner crop at 2x zoom (use for corner grading):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.bottomRight! } });

    parts.push({ text: "IMAGE 6 — Surface center crop at 2x zoom (use for surface and print quality grading):" });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: crops.surfaceCenter! } });
  } else {
    // Single-image fallback
    parts.push({ inlineData: { mimeType: frontData.mimeType, data: frontData.data } });
  }

  // Fetch back image if available
  if (backPhoto?.originalUrl) {
    const backData = await fetchImageAsBase64(backPhoto.originalUrl);
    if (backData) {
      parts.push({ inlineData: { mimeType: backData.mimeType, data: backData.data } });
    }
  }

  let text: string;
  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 3072,
      },
    });
    text = response.text ?? "";
  } catch (err) {
    console.error("[grading] Gemini API error:", err);
    throw new Error("AI grading service error. Please try again in a moment.");
  }

  // Strip markdown fences if Gemini wraps JSON in ```json ... ```
  let cleanedText = text.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "");

  const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[grading] No JSON object found in Gemini response:", text.substring(0, 500));
    throw new Error("AI returned an unexpected response. Please try grading again.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (firstErr) {
    // Attempt to fix common Gemini JSON errors:
    // 1. Trailing commas before } or ]
    // 2. Single quotes instead of double quotes in values
    // 3. Unescaped newlines inside string values
    let fixedJson = jsonMatch[0]
      .replace(/,\s*([}\]])/g, "$1")  // Remove trailing commas
      .replace(/:\s*'([^']*)'/g, ': "$1"')  // Single → double quotes
      .replace(/\n\s*\n/g, " ");  // Collapse extra newlines

    try {
      parsed = JSON.parse(fixedJson);
      console.warn("[grading] Recovered from malformed JSON after auto-fix");
    } catch (secondErr) {
      console.error("[grading] Failed to parse Gemini JSON even after fix:", jsonMatch[0].substring(0, 500));
      throw new Error("AI returned malformed data. Please try grading again.");
    }
  }

  // Build the full report
  const overallGrade = Math.max(1, Math.min(10, Math.round(parsed.overallGrade)));

  // ══════════════════════════════════════════
  // B-008: Graded vs Raw Price Split
  // ══════════════════════════════════════════
  let gradedVsRaw: GradeReport["gradedVsRaw"] | undefined;
  try {
    gradedVsRaw = await calculateGradedVsRaw(cardId, overallGrade);
  } catch (err) {
    console.error("[grading] Graded vs raw calc failed (non-fatal):", err);
  }

  const report: GradeReport = {
    overallGrade,
    overallLabel: `${PSA_LABELS[overallGrade] ?? "Unknown"} ${overallGrade}`,
    confidence: parsed.confidence ?? 50,
    dimensions: parsed.dimensions,
    gradingNotes: parsed.gradingNotes ?? "",
    psaLikelihood: parsed.psaLikelihood ?? "",
    photoQuality: parsed.photoQuality ?? "Good",
    timestamp: new Date().toISOString(),
    autographAnalysis: parsed.autographAnalysis?.type !== "none" ? parsed.autographAnalysis : undefined,
    gradedVsRaw,
    centeringPreAnalysis: centeringData,
    modelUsed: modelId,
  };

  // Store in card metadata
  await db
    .update(cards)
    .set({
      metadata: { gradeReport: report },
      condition: report.overallLabel,
      conditionNotes: report.gradingNotes,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, cardId));

  revalidatePath(`/cards/${cardId}`);
  return report;
}

// ══════════════════════════════════════════
// B-008: Graded vs Raw Price Split
// ══════════════════════════════════════════

/**
 * Calculate estimated price difference between raw and graded versions.
 * Uses PSA grade multipliers based on industry data.
 */
async function calculateGradedVsRaw(
  cardId: string,
  predictedGrade: number
): Promise<GradeReport["gradedVsRaw"]> {
  // Get current raw estimate
  const [estimate] = await db
    .select({
      usd: priceEstimates.estimatedValueUsd,
      cad: priceEstimates.estimatedValueCad,
    })
    .from(priceEstimates)
    .where(eq(priceEstimates.cardId, cardId))
    .limit(1);

  const rawUsd = parseFloat(estimate?.usd ?? "0");
  if (rawUsd <= 0) {
    return {
      rawEstimateUsd: 0,
      gradedEstimateUsd: 0,
      gradingCostUsd: 20,
      netGradingBenefit: -20,
      shouldGrade: false,
      recommendation: "No raw price data available. Get a price estimate first.",
    };
  }

  // PSA grade multipliers over raw value (industry averages)
  // These are approximate — actual multipliers vary by card, player, era
  const gradeMultipliers: Record<number, number> = {
    10: 3.5,   // PSA 10 typically 3-5x raw value
    9: 1.8,    // PSA 9 typically 1.5-2x
    8: 1.2,    // PSA 8 roughly 1.1-1.3x
    7: 0.95,   // PSA 7 can be slightly below raw for modern
    6: 0.75,   // PSA 6 is below raw
    5: 0.60,
    4: 0.45,
    3: 0.35,
    2: 0.25,
    1: 0.15,
  };

  // PSA submission tiers (approximate 2024-2025 pricing)
  // Value tier affects cost — cards worth more cost more to grade
  let gradingCostUsd = 20; // Economy tier baseline
  if (rawUsd >= 500) gradingCostUsd = 75;
  else if (rawUsd >= 200) gradingCostUsd = 50;
  else if (rawUsd >= 100) gradingCostUsd = 35;

  const multiplier = gradeMultipliers[predictedGrade] ?? 1.0;
  const gradedEstimateUsd = Math.round(rawUsd * multiplier * 100) / 100;
  const netBenefit = Math.round((gradedEstimateUsd - rawUsd - gradingCostUsd) * 100) / 100;

  let recommendation: string;
  if (predictedGrade >= 9 && netBenefit > 10) {
    recommendation = `Worth grading. A PSA ${predictedGrade} would add ~$${netBenefit.toFixed(2)} in value after the $${gradingCostUsd} grading fee. Submit to PSA.`;
  } else if (predictedGrade >= 8 && netBenefit > 5) {
    recommendation = `Marginal. A PSA ${predictedGrade} adds ~$${netBenefit.toFixed(2)} net. Consider grading if you want the slab for protection or presentation.`;
  } else if (predictedGrade >= 8 && netBenefit <= 5) {
    recommendation = `Not worth the cost. A PSA ${predictedGrade} would cost $${gradingCostUsd} to grade but only add ~$${(gradedEstimateUsd - rawUsd).toFixed(2)} in value. Keep it raw.`;
  } else {
    recommendation = `Do not grade. At PSA ${predictedGrade}, the card is worth less graded ($${gradedEstimateUsd.toFixed(2)}) than raw ($${rawUsd.toFixed(2)}) after fees. Keep it raw.`;
  }

  return {
    rawEstimateUsd: rawUsd,
    gradedEstimateUsd,
    gradingCostUsd,
    netGradingBenefit: netBenefit,
    shouldGrade: netBenefit > 10 && predictedGrade >= 8,
    recommendation,
  };
}

export async function getCardGradeReport(cardId: string): Promise<GradeReport | null> {
  const [card] = await db
    .select({ metadata: cards.metadata })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card?.metadata) return null;
  const meta = card.metadata as Record<string, unknown>;
  return (meta.gradeReport as GradeReport) ?? null;
}

// ── Helper: fetch image URL as base64 ──

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    // If it's already a data URL
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) return { mimeType: match[1], data: match[2] };
      // Try comma split as fallback for unusual data URLs
      const commaIdx = url.indexOf(",");
      if (commaIdx > 0) {
        const header = url.substring(5, commaIdx); // after "data:"
        const mimeType = header.replace(";base64", "");
        const data = url.substring(commaIdx + 1);
        return { mimeType, data };
      }
      return null;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error("[grading] Image fetch failed:", res.status, res.statusText, url.substring(0, 100));
      return null;
    }
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    return { data, mimeType };
  } catch (err) {
    console.error("[grading] Image fetch error:", err, url.substring(0, 100));
    return null;
  }
}
