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
 * Use Gemini to detect card crop region in an image.
 * Returns a simple rectangle + rotation for reliable canvas cropping.
 */
export interface CardCropRegion {
  x: number;      // left edge as fraction 0-1
  y: number;      // top edge as fraction 0-1
  width: number;   // width as fraction 0-1
  height: number;  // height as fraction 0-1
  rotation: number; // degrees clockwise to straighten (usually 0 or small)
}

export async function detectCardBounds(
  imageBase64: string,
  mimeType: string
): Promise<CardCropRegion | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a precise image analysis tool. Find the trading card in this image and return its exact position.

The card has a clear rectangular border. I need the coordinates of the card's PRINTED BORDER EDGES — not the edges of fingers, shadows, or background.

Return ONLY this JSON:
{
  "x": 0.0,
  "y": 0.0,
  "width": 0.0,
  "height": 0.0,
  "rotation": 0.0
}

Coordinate system (all values are fractions 0.0-1.0 of image dimensions):
- x = fraction from left edge of image to LEFT edge of card border
- y = fraction from top edge of image to TOP edge of card border
- width = card border width as fraction of image width
- height = card border height as fraction of image height
- rotation = degrees the card is rotated clockwise from vertical (can be negative for counter-clockwise, typically -15 to +15 degrees)

CRITICAL: Be extremely precise. Measure to the card's printed border, not to fingers or shadows. If the card is tilted even slightly (1-2 degrees), report the rotation accurately. The resulting crop must show the complete card face with no fingers, desk, or background visible.`,
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
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as CardCropRegion;
    // Validate ranges
    if (parsed.x < 0 || parsed.x > 1 || parsed.y < 0 || parsed.y > 1 ||
        parsed.width <= 0 || parsed.width > 1 || parsed.height <= 0 || parsed.height > 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
