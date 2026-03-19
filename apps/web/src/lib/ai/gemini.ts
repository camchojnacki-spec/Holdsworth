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
  mimeType: string
): Promise<CardScanResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: CARD_SCAN_SYSTEM_PROMPT + "\n\n" + CARD_SCAN_USER_PROMPT },
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
 * Use Gemini to detect card bounding box in an image.
 * Returns normalized coordinates (0-1) for the card corners.
 */
export interface CardBoundingBox {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  rotation: number; // degrees to rotate to straighten
}

export async function detectCardBounds(
  imageBase64: string,
  mimeType: string
): Promise<CardBoundingBox | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Detect the trading card in this image. Return ONLY valid JSON with the four corner coordinates of the card as fractions of the image dimensions (0.0 to 1.0), and the rotation angle in degrees needed to straighten the card (positive = clockwise correction needed).

If the card is already straight, rotation should be 0.

Return this exact JSON format:
{
  "topLeft": { "x": 0.0, "y": 0.0 },
  "topRight": { "x": 0.0, "y": 0.0 },
  "bottomRight": { "x": 0.0, "y": 0.0 },
  "bottomLeft": { "x": 0.0, "y": 0.0 },
  "rotation": 0
}

x goes left to right (0=left edge, 1=right edge). y goes top to bottom (0=top edge, 1=bottom edge).`,
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
      maxOutputTokens: 512,
    },
  });

  const text = response.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as CardBoundingBox;
  } catch {
    return null;
  }
}
