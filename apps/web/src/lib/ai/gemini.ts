import { GoogleGenAI } from "@google/genai";
import { CARD_SCAN_SYSTEM_PROMPT, CARD_SCAN_USER_PROMPT } from "./prompts";

export interface CardScanResponse {
  player_name: string;
  team: string;
  position: string | null;
  year: number;
  set_name: string;
  subset_or_insert: string | null;
  card_number: string;
  manufacturer: string;
  parallel_variant: string | null;
  serial_number: string | null;
  is_rookie_card: boolean;
  is_prospect_card: boolean;
  is_autograph: boolean;
  is_relic: boolean;
  is_short_print: boolean;
  graded: boolean;
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  condition_estimate: string;
  centering_estimate: string;
  condition_notes: string;
  is_authentic: boolean;
  authenticity_notes: string | null;
  confidence: number;
  identification_notes: string;
}

export async function scanCardWithGemini(
  imageBase64: string,
  mimeType: string,
  backImageBase64?: string,
  backMimeType?: string,
): Promise<CardScanResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Build prompt based on whether back image is provided
  const promptSuffix = backImageBase64
    ? "\n\nTwo images are provided: the FRONT of the card (first image) and the BACK of the card (second image). Use both to maximize identification accuracy. The back contains the card number, copyright year, player stats, and sometimes serial numbering."
    : "";

  parts.push({ text: CARD_SCAN_SYSTEM_PROMPT + promptSuffix + "\n\n" + CARD_SCAN_USER_PROMPT });
  parts.push({
    inlineData: {
      mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
      data: imageBase64,
    },
  });

  if (backImageBase64 && backMimeType) {
    parts.push({
      inlineData: {
        mimeType: backMimeType as "image/jpeg" | "image/png" | "image/webp",
        data: backImageBase64,
      },
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text ?? "";

  // Parse JSON from the response — handle potential markdown fencing
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from AI response");
  }

  const parsed: CardScanResponse = JSON.parse(jsonMatch[0]);
  return parsed;
}

/**
 * Use Gemini's native box_2d object detection to find the card.
 * Returns coordinates normalized 0-1 (converted from Gemini's 0-1000 scale).
 */
export interface CardCropRegion {
  x: number;      // left edge as fraction 0-1
  y: number;      // top edge as fraction 0-1
  width: number;   // width as fraction 0-1
  height: number;  // height as fraction 0-1
  rotation: number; // always 0 for box_2d (axis-aligned)
}

export async function detectCardBounds(
  imageBase64: string,
  mimeType: string
): Promise<CardCropRegion | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    systemInstruction: "Return bounding boxes as a JSON array with labels. Never return masks or code fencing.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Detect the trading card in this image. Output a JSON list where each entry contains the 2D bounding box in key "box_2d" and text label in key "label".`,
          },
          {
            inlineData: {
              mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    config: {
      temperature: 0.5,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let text = response.text ?? "";
  console.log("[detectCardBounds] Raw Gemini response:", text);

  // Strip markdown code fences if present
  text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Parse the box_2d array from the response
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.log("[detectCardBounds] No array match found in response");
    return null;
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    console.log("[detectCardBounds] Parsed:", JSON.stringify(parsed));

    // Handle both [{box_2d: [...]}] and [[ymin,xmin,ymax,xmax]] formats
    let box: number[] | undefined;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first?.box_2d && Array.isArray(first.box_2d)) {
        box = first.box_2d;
      } else if (Array.isArray(first) && first.length === 4) {
        // Gemini might return [[ymin,xmin,ymax,xmax]] directly
        box = first;
      } else if (typeof first === "number" && parsed.length === 4) {
        // Or just [ymin,xmin,ymax,xmax] flat
        box = parsed;
      }
    }

    if (!box || box.length !== 4) {
      console.log("[detectCardBounds] Could not extract box_2d from parsed data");
      return null;
    }

    const [ymin, xmin, ymax, xmax] = box.map((v: number) => v / 1000);
    console.log("[detectCardBounds] Normalized coords:", { xmin, ymin, xmax, ymax });

    // Validate
    if (xmin < 0 || xmin >= xmax || ymin < 0 || ymin >= ymax ||
        xmax > 1.05 || ymax > 1.05) {
      console.log("[detectCardBounds] Validation failed");
      return null;
    }

    // Add 3% padding around detected edges so card borders aren't clipped
    const padX = (xmax - xmin) * 0.03;
    const padY = (ymax - ymin) * 0.03;
    const px1 = Math.max(0, xmin - padX);
    const py1 = Math.max(0, ymin - padY);
    const px2 = Math.min(1, xmax + padX);
    const py2 = Math.min(1, ymax + padY);

    const result = {
      x: px1,
      y: py1,
      width: px2 - px1,
      height: py2 - py1,
      rotation: 0,
    };
    console.log("[detectCardBounds] Returning crop region:", result);
    return result;
  } catch (err) {
    console.log("[detectCardBounds] Parse error:", err);
    return null;
  }
}
