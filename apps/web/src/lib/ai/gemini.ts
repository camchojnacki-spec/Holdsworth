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
