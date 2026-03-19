"use server";

import { GoogleGenAI } from "@google/genai";
import { scrapeEbaySold, buildEbayQueries } from "./scrape-ebay";
import { scrape130Point } from "./scrape-130point";

export interface SoldListing {
  title: string;
  price: number;
  date: string;
  source: string;
  url: string;
  shippingPrice?: number | null;
}

export interface PriceLookupResult {
  success: boolean;
  query: string;
  sourceUrls: { ebay?: string; oneThirtyPoint?: string };
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
  dataSources: string[];
  error?: string;
}

/**
 * Real pricing engine — scrapes eBay sold listings and 130point,
 * then uses Gemini AI to analyze the REAL data.
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
  isAutograph?: boolean;
  subsetOrInsert?: string | null;
}): Promise<PriceLookupResult> {
  const queries = await buildEbayQueries(card);
  const primaryQuery = queries[0];
  const allListings: SoldListing[] = [];
  const sourceUrls: { ebay?: string; oneThirtyPoint?: string } = {};
  const dataSources: string[] = [];

  // ── Scrape eBay sold listings ──
  let ebaySuccess = false;
  let firstEbayUrl: string | undefined;
  for (const query of queries) {
    console.log(`[prices] eBay search: "${query}"`);
    const ebayResult = await scrapeEbaySold(query);
    if (!firstEbayUrl) firstEbayUrl = ebayResult.url;
    // Use the URL of whichever query returned results, or the first query
    if (!sourceUrls.ebay) sourceUrls.ebay = ebayResult.url;

    if (ebayResult.success && ebayResult.listings.length > 0) {
      console.log(`[prices] eBay found ${ebayResult.listings.length} listings`);
      for (const listing of ebayResult.listings) {
        allListings.push({
          title: listing.title,
          price: listing.price,
          date: listing.date,
          source: "ebay",
          url: listing.url,
          shippingPrice: listing.shippingPrice,
        });
      }
      dataSources.push("eBay Sold Listings");
      ebaySuccess = true;
      break;
    }
  }

  if (!ebaySuccess) {
    console.log("[prices] No eBay results for any query");
  }

  // ── Scrape 130point ──
  console.log(`[prices] 130point search: "${primaryQuery}"`);
  const oneThirtyResult = await scrape130Point(primaryQuery);
  sourceUrls.oneThirtyPoint = oneThirtyResult.url;

  if (oneThirtyResult.success && oneThirtyResult.listings.length > 0) {
    console.log(`[prices] 130point found ${oneThirtyResult.listings.length} listings`);
    for (const listing of oneThirtyResult.listings) {
      allListings.push({
        title: listing.title,
        price: listing.price,
        date: listing.date,
        source: "130point",
        url: listing.url,
      });
    }
    dataSources.push("130point.com");
  }

  // ── Calculate stats from real data ──
  const prices = allListings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
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

  // ── AI analysis of real data ──
  let estimatedValue: PriceLookupResult["estimatedValue"] = null;
  let marketNotes: string | null = null;

  if (count > 0) {
    const aiAnalysis = await analyzeWithAI(card, allListings, stats!);
    estimatedValue = aiAnalysis.estimatedValue;
    marketNotes = aiAnalysis.notes;
  } else {
    const aiEstimate = await aiEstimateFallback(card);
    estimatedValue = aiEstimate.estimatedValue;
    marketNotes = aiEstimate.notes
      ? `[No sold data found] ${aiEstimate.notes}`
      : "[No sold data found] Unable to find recent comparable sales for this exact card.";
    dataSources.push("AI Estimate (no real data found)");
  }

  // Sort by date descending
  allListings.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return {
    success: count > 0 || allListings.length > 0,
    query: primaryQuery,
    sourceUrls,
    listings: allListings.slice(0, 20),
    stats,
    estimatedValue,
    marketNotes,
    dataSources,
  };
}

/**
 * Use Gemini to ANALYZE real scraped data — not to make up prices.
 */
async function analyzeWithAI(
  card: { playerName: string; parallelVariant?: string | null; [key: string]: unknown },
  listings: SoldListing[],
  stats: NonNullable<PriceLookupResult["stats"]>,
): Promise<{ estimatedValue: PriceLookupResult["estimatedValue"]; notes: string | null }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { estimatedValue: null, notes: null };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const listingSummary = listings.slice(0, 15).map(l =>
      `"${l.title}" — $${l.price} (${l.date || "no date"}, ${l.source})`
    ).join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a baseball card market analyst. I have REAL sold listing data. Analyze it and provide a fair market value estimate.

CARD: ${card.playerName} — ${card.parallelVariant || "base"}

REAL SOLD DATA (${stats.count} listings):
Average: $${stats.avgPrice} | Median: $${stats.medianPrice} | Low: $${stats.lowPrice} | High: $${stats.highPrice}

INDIVIDUAL SALES:
${listingSummary}

Based on this REAL data, return JSON only:
{
  "estimatedValue": { "low": 0, "mid": 0, "high": 0, "currency": "USD" },
  "notes": "2-3 sentences analyzing the real sales data — price trends, outliers to ignore, fair market value rationale"
}

Rules:
- Base your estimate ONLY on the real data above
- Identify and discount outliers (lots, damaged, different variants mixed in)
- The "mid" should represent what a buyer would reasonably pay today
- Keep notes factual and concise`
        }]
      }],
      config: { temperature: 0.2, maxOutputTokens: 1024 },
    });

    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { estimatedValue: null, notes: null };

    const data = JSON.parse(jsonMatch[0]);
    return {
      estimatedValue: data.estimatedValue || null,
      notes: data.notes || null,
    };
  } catch {
    return { estimatedValue: null, notes: null };
  }
}

/**
 * Fallback: AI estimate when no real data is found.
 */
async function aiEstimateFallback(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  parallelVariant?: string | null;
  [key: string]: unknown;
}): Promise<{ estimatedValue: PriceLookupResult["estimatedValue"]; notes: string | null }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { estimatedValue: null, notes: null };

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `No real sold listing data was found for this card. Provide your best estimate based on market knowledge.

Card: ${card.year || ""} ${card.setName || ""} ${card.playerName} ${card.parallelVariant || "base"}

Return JSON only:
{
  "estimatedValue": { "low": 0, "mid": 0, "high": 0, "currency": "USD" },
  "notes": "Brief note explaining this is an AI estimate with no real sales data to validate against"
}

Be conservative. If uncertain, use wide ranges.`
        }]
      }],
      config: { temperature: 0.3, maxOutputTokens: 512 },
    });

    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { estimatedValue: null, notes: null };

    const data = JSON.parse(jsonMatch[0]);
    return {
      estimatedValue: data.estimatedValue || null,
      notes: data.notes || null,
    };
  } catch {
    return { estimatedValue: null, notes: null };
  }
}
