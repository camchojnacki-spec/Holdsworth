import { getGemini } from "./gemini";

export interface CardTextExtraction {
  cardNumber: string | null;
  copyrightYear: number | null;
  playerNameAsWritten: string | null;
  manufacturerText: string | null;
  serialNumber: string | null; // e.g., "043/199"
  otherText: string[]; // any other visible text
}

const TEXT_EXTRACTION_PROMPT = `Read ALL visible text on this trading card image. Focus on extracting structured data.
Return JSON only:
{
  "cardNumber": "the card number as printed (e.g., '145', 'T65-12', 'RC-5')" or null,
  "copyrightYear": the 4-digit year from copyright line or null,
  "playerNameAsWritten": "player name exactly as printed on card" or null,
  "manufacturerText": "any manufacturer/brand text (Topps, Panini, Bowman, etc.)" or null,
  "serialNumber": "serial numbering if present (e.g., '043/199')" or null,
  "otherText": ["any other significant text on the card"]
}`;

/**
 * Stage 1: Fast, cheap text extraction from card images.
 * Uses Gemini 2.5-flash at temperature 0.0 with a small token limit.
 * Optimized purely for reading text — no identification logic.
 */
export async function extractCardText(
  frontBase64: string,
  frontMimeType: string,
  backBase64?: string,
  backMimeType?: string
): Promise<CardTextExtraction> {
  const ai = getGemini();

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  const imageSuffix = backBase64
    ? "\n\nTwo images are provided: the FRONT (first) and BACK (second) of the card. Read text from both."
    : "";

  parts.push({ text: TEXT_EXTRACTION_PROMPT + imageSuffix });
  parts.push({
    inlineData: {
      mimeType: frontMimeType as "image/jpeg" | "image/png" | "image/webp",
      data: frontBase64,
    },
  });

  if (backBase64 && backMimeType) {
    parts.push({
      inlineData: {
        mimeType: backMimeType as "image/jpeg" | "image/png" | "image/webp",
        data: backBase64,
      },
    });
  }

  console.log("[text-extraction] Starting fast text extraction...");
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0.0,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const elapsed = Date.now() - startTime;
  const text = response.text ?? "";
  console.log(`[text-extraction] Completed in ${elapsed}ms`);

  // Parse JSON response
  let jsonStr = text;
  if (!text.startsWith("{")) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[text-extraction] Failed to extract JSON, returning empty result");
      return {
        cardNumber: null,
        copyrightYear: null,
        playerNameAsWritten: null,
        manufacturerText: null,
        serialNumber: null,
        otherText: [],
      };
    }
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const result: CardTextExtraction = {
      cardNumber: parsed.cardNumber ?? null,
      copyrightYear:
        typeof parsed.copyrightYear === "number" ? parsed.copyrightYear : null,
      playerNameAsWritten: parsed.playerNameAsWritten ?? null,
      manufacturerText: parsed.manufacturerText ?? null,
      serialNumber: parsed.serialNumber ?? null,
      otherText: Array.isArray(parsed.otherText) ? parsed.otherText : [],
    };
    console.log("[text-extraction] Result:", JSON.stringify(result));
    return result;
  } catch (err) {
    console.error("[text-extraction] JSON parse error:", err);
    return {
      cardNumber: null,
      copyrightYear: null,
      playerNameAsWritten: null,
      manufacturerText: null,
      serialNumber: null,
      otherText: [],
    };
  }
}
