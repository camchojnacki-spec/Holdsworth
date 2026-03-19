"use server";

import { GoogleGenAI } from "@google/genai";

export interface SoldListing {
  title: string;
  price: number;
  date: string;
  source: string;
}

export interface PriceLookupResult {
  success: boolean;
  query: string;
  listings: SoldListing[];
  stats: {
    count: number;
    avgPrice: number;
    medianPrice: number;
    lowPrice: number;
    highPrice: number;
    avgPriceCad: number;
  } | null;
  estimatedValue: {
    low: number;
    mid: number;
    high: number;
    currency: string;
  } | null;
  marketNotes: string | null;
  error?: string;
}

/**
 * Build a descriptive search string for price lookup.
 */
function buildCardDescription(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}): string {
  const parts: string[] = [];
  if (card.year) parts.push(String(card.year));
  if (card.manufacturer && card.setName && !card.setName.toLowerCase().includes(card.manufacturer.toLowerCase())) {
    parts.push(card.manufacturer);
  }
  if (card.setName) parts.push(card.setName);
  parts.push(card.playerName);
  if (card.cardNumber) parts.push(`#${card.cardNumber.replace(/^#/, "")}`);
  if (card.parallelVariant) parts.push(card.parallelVariant);
  if (card.graded && card.gradingCompany && card.grade) {
    parts.push(`${card.gradingCompany} ${card.grade}`);
  }
  return parts.join(" ");
}

/**
 * Use Gemini AI to estimate card value based on its knowledge of card markets.
 * This approach works without scraping — Gemini draws on its training data
 * about eBay sold prices, card market trends, and collector values.
 */
export async function lookupCardPrice(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}): Promise<PriceLookupResult> {
  const query = buildCardDescription(card);

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return { success: false, query, listings: [], stats: null, estimatedValue: null, marketNotes: null, error: "API key not configured" };
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a baseball card market analyst. Estimate the current market value and provide recent comparable sales data for this card:

${query}

Return ONLY valid JSON:
{
  "listings": [
    { "title": "descriptive listing title matching real eBay sold format", "price": 0.00, "date": "YYYY-MM-DD", "source": "ebay" }
  ],
  "estimatedValue": { "low": 0, "mid": 0, "high": 0, "currency": "USD" },
  "notes": "2-3 sentences on market context — demand trends, player performance impact, comparable parallel values"
}

Rules:
- Provide 3-6 realistic comparable sales based on actual market knowledge
- Prices should reflect real market values for this exact card, parallel, and condition
- Account for the specific parallel/variant — numbered cards, refractors, autos are worth more than base
- If this is a common base card, prices may be $0.25-$2.00
- If you're uncertain, provide wider low/high ranges
- Dates should be within the last 12 months
- Be honest if you have low confidence in pricing`
        }]
      }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });

    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, query, listings: [], stats: null, estimatedValue: null, marketNotes: null, error: "Could not parse price data" };
    }

    const data = JSON.parse(jsonMatch[0]);
    const listings: SoldListing[] = (data.listings || []).map((l: { title?: string; price?: number; date?: string; source?: string }) => ({
      title: l.title || "",
      price: l.price || 0,
      date: l.date || "",
      source: l.source || "ebay",
    }));

    // Calculate stats from listings
    const prices = listings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
    const count = prices.length;
    const usdToCad = 1.38;

    let stats = null;
    if (count > 0) {
      const avgPrice = prices.reduce((s, p) => s + p, 0) / count;
      const medianPrice = count % 2 === 0
        ? (prices[count / 2 - 1] + prices[count / 2]) / 2
        : prices[Math.floor(count / 2)];
      stats = {
        count,
        avgPrice: Math.round(avgPrice * 100) / 100,
        medianPrice: Math.round(medianPrice * 100) / 100,
        lowPrice: prices[0],
        highPrice: prices[count - 1],
        avgPriceCad: Math.round(avgPrice * usdToCad * 100) / 100,
      };
    }

    return {
      success: true,
      query,
      listings,
      stats,
      estimatedValue: data.estimatedValue || null,
      marketNotes: data.notes || null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price lookup failed";
    return { success: false, query, listings: [], stats: null, estimatedValue: null, marketNotes: null, error: message };
  }
}
