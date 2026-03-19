"use server";

import { GoogleGenAI } from "@google/genai";
import { db, cards, cardPhotos } from "@holdsworth/db";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * AI Card Grading Engine — PSA-style condition assessment via Gemini Vision.
 *
 * Analyzes HD card photos across 6 dimensions:
 *   Centering, Corners, Edges, Surface, Print Quality, Overall
 *
 * Returns a structured grade report with a 1-10 scale matching PSA standards.
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

const GRADING_PROMPT = `You are Holdsworth's AI Card Grading Engine — a professional-grade condition assessor trained on tens of thousands of PSA, BGS, and SGC graded cards.

Analyze this card photo with the precision of a professional grader. You are looking at a REAL physical card and must assess its condition honestly.

## GRADING PROTOCOL

### 1. CENTERING (measure carefully)
- Estimate left-right border ratio (e.g., 52/48, 60/40, 70/30)
- Estimate top-bottom border ratio
- PSA 10 requires 55/45 or better in both directions
- PSA 9 allows 60/40 in one direction
- PSA 8 allows 65/35
- Anything worse than 70/30 caps the grade at 7 or below

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
  "gradingNotes": "Summary of key findings...",
  "psaLikelihood": "If submitted to PSA, this card would likely receive a PSA 8 (NM-MT). The centering is good enough for a 9, but the left edge chipping limits the grade."
}`;

export async function gradeCard(cardId: string): Promise<GradeReport | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

  // Get card photos — try cardPhotos table first, then fall back to cards table
  const photos = await db
    .select({ originalUrl: cardPhotos.originalUrl, photoType: cardPhotos.photoType })
    .from(cardPhotos)
    .where(eq(cardPhotos.cardId, cardId));

  let frontUrl = photos.find((p) => p.photoType === "front")?.originalUrl;

  // Fallback: check if the card has a direct photo URL via the cards/photos join
  if (!frontUrl) {
    const [photo] = await db
      .select({ originalUrl: cardPhotos.originalUrl })
      .from(cardPhotos)
      .where(and(eq(cardPhotos.cardId, cardId)))
      .limit(1);
    frontUrl = photo?.originalUrl ?? null;
  }

  if (!frontUrl) {
    console.error("[grading] No photo found for card", cardId, "photos query returned:", photos.length, "rows");
    return null;
  }

  const backPhoto = photos.find((p) => p.photoType === "back");

  // Fetch images as base64
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  let promptText = GRADING_PROMPT + "\n\nAnalyze this card's condition. ";
  if (backPhoto?.originalUrl) {
    promptText += "Two images provided: FRONT (first) and BACK (second). Grade the front primarily but note any back defects.";
  } else {
    promptText += "Only the front is provided. Note that back condition cannot be assessed.";
  }

  parts.push({ text: promptText });

  // Fetch front image
  const frontData = await fetchImageAsBase64(frontUrl);
  if (!frontData) {
    console.error("[grading] Failed to fetch front image from URL:", frontUrl?.substring(0, 100));
    return null;
  }
  parts.push({ inlineData: { mimeType: frontData.mimeType, data: frontData.data } });

  // Fetch back image if available
  if (backPhoto?.originalUrl) {
    const backData = await fetchImageAsBase64(backPhoto.originalUrl);
    if (backData) {
      parts.push({ inlineData: { mimeType: backData.mimeType, data: backData.data } });
    }
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);

  // Build the full report
  const overallGrade = Math.max(1, Math.min(10, Math.round(parsed.overallGrade)));
  const report: GradeReport = {
    overallGrade,
    overallLabel: `${PSA_LABELS[overallGrade] ?? "Unknown"} ${overallGrade}`,
    confidence: parsed.confidence ?? 50,
    dimensions: parsed.dimensions,
    gradingNotes: parsed.gradingNotes ?? "",
    psaLikelihood: parsed.psaLikelihood ?? "",
    photoQuality: parsed.photoQuality ?? "Good",
    timestamp: new Date().toISOString(),
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
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mimeType: match[1], data: match[2] };
    }

    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    const mimeType = res.headers.get("content-type") || "image/jpeg";
    return { data, mimeType };
  } catch {
    return null;
  }
}
