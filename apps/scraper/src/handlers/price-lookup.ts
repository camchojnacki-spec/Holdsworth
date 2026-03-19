import { db, priceEstimates, priceSources, priceHistory } from "@holdsworth/db";
import { eq, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { scrape130Point } from "../scrapers/scrape-130point";
import { scrapeEbayApi } from "../scrapers/scrape-ebay-api";
import { buildSearchQueries } from "../scrapers/query-builder";
import { parseSaleDate } from "../lib/dates";
import { log, logError } from "../lib/logger";
import type { CardPricePayload } from "@holdsworth/db";

interface SoldListing {
  title: string;
  price: number;
  date: string;
  source: string;
  url: string;
}

/**
 * Execute a price lookup job.
 * Scrapes 130point + eBay API, analyzes with Gemini, stores in DB.
 */
export async function handlePriceLookup(
  jobId: string,
  cardId: string,
  payload: CardPricePayload
): Promise<{ success: boolean; listingCount: number; estimateUsd: number | null; sources: string[] }> {
  const queries = buildSearchQueries(payload);
  const primaryQuery = queries[0];
  const allListings: SoldListing[] = [];
  const sources: string[] = [];
  const usdToCad = 1.38;

  // ── 130point (sold data — primary source) ──
  for (const query of queries.slice(0, 2)) {
    log("price-lookup", `130point search: "${query}"`, { jobId, cardId });
    const result = await scrape130Point(query);
    if (result.success && result.listings.length > 0) {
      log("price-lookup", `130point found ${result.listings.length} sold listings`, { jobId });
      for (const listing of result.listings) {
        allListings.push({
          title: listing.title,
          price: listing.price,
          date: listing.date,
          source: "130point",
          url: listing.url,
        });
      }
      sources.push("130point.com");
      break; // First successful query is enough
    }
  }

  // ── eBay Browse API (active listings) ──
  log("price-lookup", `eBay API search: "${primaryQuery}"`, { jobId, cardId });
  const ebayResult = await scrapeEbayApi(primaryQuery);
  if (ebayResult.success && ebayResult.listings.length > 0) {
    log("price-lookup", `eBay API found ${ebayResult.listings.length} active listings`, { jobId });
    for (const listing of ebayResult.listings.slice(0, 10)) {
      allListings.push({
        title: listing.title,
        price: listing.price,
        date: "active",
        source: "ebay-active",
        url: listing.url,
      });
    }
    sources.push("eBay Active Listings");
  }

  // ── Calculate stats ──
  // Only use sold listings (not active) for valuation
  const soldPrices = allListings
    .filter((l) => l.source !== "ebay-active")
    .map((l) => l.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  const allPrices = allListings.map((l) => l.price).filter((p) => p > 0).sort((a, b) => a - b);
  const count = soldPrices.length || allPrices.length;
  const prices = soldPrices.length > 0 ? soldPrices : allPrices;

  let estimateUsd: number | null = null;

  if (prices.length > 0) {
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const median = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    // Use Gemini to analyze real data
    const aiResult = await analyzeWithGemini(payload, allListings, {
      count: prices.length,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      low: prices[0],
      high: prices[prices.length - 1],
    });

    estimateUsd = aiResult?.mid ?? Math.round(median * 100) / 100;
    const estimateCad = Math.round((estimateUsd) * usdToCad * 100) / 100;

    // Upsert price estimate
    await db
      .insert(priceEstimates)
      .values({
        cardId,
        estimatedValueUsd: String(estimateUsd),
        estimatedValueCad: String(estimateCad),
        confidence: soldPrices.length >= 3 ? "high" : soldPrices.length > 0 ? "medium" : "low",
        sampleSize: count,
        priceTrend: "stable",
      })
      .onConflictDoUpdate({
        target: priceEstimates.cardId,
        set: {
          estimatedValueUsd: String(estimateUsd),
          estimatedValueCad: String(estimateCad),
          confidence: soldPrices.length >= 3 ? "high" : soldPrices.length > 0 ? "medium" : "low",
          sampleSize: count,
          lastUpdated: new Date(),
        },
      });

    log("price-lookup", `Stored estimate: $${estimateUsd} USD ($${estimateCad} CAD)`, { jobId, cardId });
  } else {
    log("price-lookup", "No pricing data found from any source", { jobId, cardId });
  }

  // ── Store individual comps in priceHistory ──
  if (allListings.length > 0) {
    // Ensure sources exist
    const sourceMap = await ensureSources();

    for (const listing of allListings.slice(0, 20)) {
      const sourceId = listing.source === "ebay-active"
        ? sourceMap["eBay Active"]
        : sourceMap["eBay Sold"];

      if (!sourceId) continue;

      try {
        await db.insert(priceHistory).values({
          cardId,
          sourceId,
          priceUsd: String(listing.price),
          priceCad: String(Math.round(listing.price * usdToCad * 100) / 100),
          currencyRate: String(usdToCad),
          saleDate: parseSaleDate(listing.date), // SAFE: returns null on invalid dates
          listingUrl: listing.url || null,
          condition: null,
          graded: false,
        });
      } catch (err) {
        // Skip duplicates or other insert errors — don't crash the pipeline
        logError("price-lookup", `Failed to insert comp: ${listing.title.substring(0, 50)}`, err);
      }
    }

    log("price-lookup", `Stored ${Math.min(allListings.length, 20)} comps`, { jobId, cardId });
  }

  return {
    success: allListings.length > 0,
    listingCount: allListings.length,
    estimateUsd,
    sources,
  };
}

// ── Helpers ──

const sourceCache: Record<string, string> = {};

async function ensureSources(): Promise<Record<string, string>> {
  if (sourceCache["eBay Sold"] && sourceCache["eBay Active"]) return sourceCache;

  for (const [name, baseUrl, type] of [
    ["eBay Sold", "https://130point.com", "api"],
    ["eBay Active", "https://api.ebay.com", "api"],
  ] as const) {
    let [source] = await db.select().from(priceSources).where(eq(priceSources.name, name)).limit(1);
    if (!source) {
      [source] = await db.insert(priceSources).values({ name, baseUrl, scraperType: type }).returning();
    }
    sourceCache[name] = source.id;
  }

  return sourceCache;
}

async function analyzeWithGemini(
  card: CardPricePayload,
  listings: SoldListing[],
  stats: { count: number; avg: number; median: number; low: number; high: number }
): Promise<{ low: number; mid: number; high: number } | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const listingSummary = listings
      .slice(0, 15)
      .map((l) => `"${l.title}" — $${l.price} (${l.date || "no date"}, ${l.source})`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Analyze these REAL sold listings and estimate fair market value.

CARD: ${card.playerName} ${card.year || ""} ${card.setName || ""} ${card.parallelVariant || "base"} ${card.isAutograph ? "autograph" : ""}

DATA (${stats.count} sales): Avg $${stats.avg} | Median $${stats.median} | Low $${stats.low} | High $${stats.high}

SALES:
${listingSummary}

Return JSON only: {"low": 0, "mid": 0, "high": 0}
Base on real data. Discount outliers. Mid = reasonable buy price today.`,
        }],
      }],
      config: { temperature: 0.2, maxOutputTokens: 256 },
    });

    const text = response.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
