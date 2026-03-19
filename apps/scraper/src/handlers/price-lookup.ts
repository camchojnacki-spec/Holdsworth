import { db, priceEstimates, priceSources, priceHistory } from "@holdsworth/db";
import { eq } from "drizzle-orm";
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
  matchScore?: number;
  excluded?: boolean;
  excludeReason?: string;
}

/**
 * Execute a price lookup job.
 * Scrapes → pre-filters → Gemini analysis → stores in DB.
 */
export async function handlePriceLookup(
  jobId: string,
  cardId: string,
  payload: CardPricePayload
): Promise<{ success: boolean; listingCount: number; filteredCount: number; estimateUsd: number | null; sources: string[] }> {
  const queries = buildSearchQueries(payload);
  const primaryQuery = queries[0];
  const allListings: SoldListing[] = [];
  const sources: string[] = [];
  const usdToCad = 1.38;

  // ── Scrape 130point (sold data) ──
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
      break;
    }
  }

  // ── Scrape eBay Browse API (active listings) ──
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

  // ══════════════════════════════════════════
  // LAYER 1: Code-based pre-filter (free, instant)
  // ══════════════════════════════════════════
  const preFiltered = preFilterListings(allListings, payload);
  const soldFiltered = preFiltered.filter((l) => l.source !== "ebay-active" && !l.excluded);
  const allFiltered = preFiltered.filter((l) => !l.excluded);

  log("price-lookup", `Pre-filter: ${allListings.length} → ${allFiltered.length} listings (${allListings.length - allFiltered.length} excluded)`, { jobId });

  // ══════════════════════════════════════════
  // LAYER 2: Gemini smart analysis
  // ══════════════════════════════════════════
  let estimateUsd: number | null = null;
  const soldPrices = soldFiltered.map((l) => l.price).sort((a, b) => a - b);
  const allPrices = allFiltered.map((l) => l.price).sort((a, b) => a - b);
  const prices = soldPrices.length > 0 ? soldPrices : allPrices;

  if (prices.length > 0) {
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const median = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    // Gemini analyzes the pre-filtered results with card context
    const aiResult = await analyzeWithGemini(payload, allFiltered, {
      count: prices.length,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      low: prices[0],
      high: prices[prices.length - 1],
    });

    estimateUsd = aiResult?.mid ?? Math.round(median * 100) / 100;
    const estimateCad = Math.round(estimateUsd * usdToCad * 100) / 100;

    // Upsert price estimate
    await db
      .insert(priceEstimates)
      .values({
        cardId,
        estimatedValueUsd: String(estimateUsd),
        estimatedValueCad: String(estimateCad),
        confidence: soldFiltered.length >= 5 ? "high" : soldFiltered.length >= 2 ? "medium" : "low",
        sampleSize: soldFiltered.length || allFiltered.length,
        priceTrend: "stable",
      })
      .onConflictDoUpdate({
        target: priceEstimates.cardId,
        set: {
          estimatedValueUsd: String(estimateUsd),
          estimatedValueCad: String(estimateCad),
          confidence: soldFiltered.length >= 5 ? "high" : soldFiltered.length >= 2 ? "medium" : "low",
          sampleSize: soldFiltered.length || allFiltered.length,
          lastUpdated: new Date(),
        },
      });

    log("price-lookup", `Stored estimate: $${estimateUsd} USD ($${estimateCad} CAD) from ${soldFiltered.length} sold comps`, { jobId, cardId });
  } else {
    log("price-lookup", "No relevant listings after filtering", { jobId, cardId });
  }

  // ── Store individual comps (only good matches) ──
  if (allFiltered.length > 0) {
    const sourceMap = await ensureSources();

    for (const listing of allFiltered.slice(0, 20)) {
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
          saleDate: parseSaleDate(listing.date),
          listingUrl: listing.url || null,
          condition: null,
          graded: false,
        });
      } catch (err) {
        logError("price-lookup", `Failed to insert comp`, err);
      }
    }

    log("price-lookup", `Stored ${Math.min(allFiltered.length, 20)} comps`, { jobId, cardId });
  }

  return {
    success: allFiltered.length > 0,
    listingCount: allListings.length,
    filteredCount: allFiltered.length,
    estimateUsd,
    sources,
  };
}

// ══════════════════════════════════════════
// LAYER 1: Code-based pre-filter
// ══════════════════════════════════════════

/**
 * Fast, free filtering before Gemini analysis.
 * Removes obvious non-matches: wrong parallels, lots, graded vs raw mismatches.
 */
function preFilterListings(listings: SoldListing[], card: CardPricePayload): SoldListing[] {
  const cardParallel = (card.parallelVariant || "").toLowerCase();
  const isBaseCard = !cardParallel || cardParallel === "base" || cardParallel === "base card";

  // ── PRIMARY GATE: Card number match ──
  // If we know the card number, the listing MUST contain it.
  // This is the single most effective filter — different card numbers = different cards.
  const cardNumber = card.cardNumber?.trim();
  const cardNumberVariants: string[] = [];
  if (cardNumber) {
    cardNumberVariants.push(cardNumber.toLowerCase());
    // Also match with spaces/hyphens swapped: "90A-LAC" → "90a lac", "90a-lac"
    cardNumberVariants.push(cardNumber.toLowerCase().replace(/-/g, " "));
    cardNumberVariants.push(cardNumber.toLowerCase().replace(/-/g, ""));
    // Handle # prefix: "#90A-LAC"
    cardNumberVariants.push(`#${cardNumber.toLowerCase()}`);
  }

  // Numbered parallel patterns
  const numberedParallelRegex = /\/\s*(\d{1,4})\b/;
  const colorParallels = ["red", "gold", "orange", "purple", "green", "pink", "black", "platinum", "superfractor", "sapphire", "magenta", "lava"];
  const lotIndicators = ["lot", "bundle", "x2", "x3", "x4", "x5", "lot of", "card lot", "team lot", "collection"];
  const gradedIndicators = ["psa ", "bgs ", "sgc ", "cgc ", " psa", " bgs", " sgc", " cgc", "psa10", "psa9", "bgs9"];

  return listings.map((listing) => {
    const titleLower = listing.title.toLowerCase();

    // ── GATE 1: Card number MUST be in the title ──
    if (cardNumberVariants.length > 0) {
      const hasCardNumber = cardNumberVariants.some((v) => titleLower.includes(v));
      if (!hasCardNumber) {
        return { ...listing, excluded: true, excludeReason: `wrong card number (need ${cardNumber})` };
      }
    }

    // Exclude lots/bundles
    if (lotIndicators.some((ind) => titleLower.includes(ind))) {
      return { ...listing, excluded: true, excludeReason: "lot/bundle" };
    }

    // Exclude graded if our card is raw
    if (!card.graded && gradedIndicators.some((g) => titleLower.includes(g))) {
      return { ...listing, excluded: true, excludeReason: "graded (card is raw)" };
    }

    // Exclude raw if our card is graded
    if (card.graded && !gradedIndicators.some((g) => titleLower.includes(g))) {
      return { ...listing, excluded: true, excludeReason: "raw (card is graded)" };
    }

    // For base cards: exclude numbered parallels
    if (isBaseCard) {
      const numMatch = titleLower.match(numberedParallelRegex);
      if (numMatch) {
        const printRun = parseInt(numMatch[1]);
        // Exclude short prints (/5, /10, /25, /50, /75, /99) but allow large runs (/2025, /500+)
        if (printRun <= 199) {
          return { ...listing, excluded: true, excludeReason: `numbered parallel /${printRun}` };
        }
      }

      // Exclude known color parallels for base cards
      if (colorParallels.some((color) => {
        // Must be a standalone word, not part of team name (e.g., "Red Sox")
        const regex = new RegExp(`\\b${color}\\b(?!\\s+(sox|wings|bulls|storm))`, "i");
        return regex.test(listing.title);
      })) {
        return { ...listing, excluded: true, excludeReason: "color parallel" };
      }
    }

    // For specific parallels: only include if title mentions our parallel
    if (!isBaseCard && cardParallel) {
      const parallelWords = cardParallel.split(/\s+/).filter((w) => w.length > 2);
      const hasParallelMatch = parallelWords.some((word) => titleLower.includes(word.toLowerCase()));
      if (!hasParallelMatch) {
        // Don't exclude, but note it's a weak match
        return { ...listing, matchScore: 50 };
      }
    }

    return { ...listing, matchScore: 100 };
  });
}

// ══════════════════════════════════════════
// LAYER 2: Gemini smart analysis
// ══════════════════════════════════════════

async function analyzeWithGemini(
  card: CardPricePayload,
  listings: SoldListing[],
  stats: { count: number; avg: number; median: number; low: number; high: number }
): Promise<{ low: number; mid: number; high: number } | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Build card description for Gemini
    const cardDesc = [
      card.playerName,
      card.year,
      card.setName,
      card.cardNumber ? `#${card.cardNumber}` : null,
      card.parallelVariant || "base (no parallel)",
      card.isAutograph ? "autograph" : null,
      card.subsetOrInsert,
      card.graded ? `${card.gradingCompany} ${card.grade}` : "raw (ungraded)",
    ].filter(Boolean).join(" | ");

    const listingSummary = listings
      .filter((l) => !l.excluded)
      .slice(0, 25)
      .map((l, i) => `${i + 1}. "$${l.price} — ${l.title}" [${l.source}, ${l.date || "no date"}]`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a baseball card market analyst. Analyze these comparable sales and estimate fair market value.

MY EXACT CARD: ${cardDesc}

COMPARABLE LISTINGS (pre-filtered, ${stats.count} total):
${listingSummary}

STATS: Avg $${stats.avg} | Median $${stats.median} | Low $${stats.low} | High $${stats.high}

ANALYSIS RULES:
1. Only use listings that match MY EXACT CARD (same parallel, same condition type)
2. EXCLUDE: different parallels (e.g., /5 Red when my card is base), lots/bundles, graded if mine is raw
3. EXCLUDE: "best offer accepted" listings where price may not reflect actual sale price (these often show the listing price, not the accepted offer)
4. Weight recent sales more heavily than older ones
5. If fewer than 3 clean matches remain, note low confidence

Return JSON only:
{"low": 0, "mid": 0, "high": 0}

The "mid" should be what a buyer would reasonably pay today for this exact card.`,
        }],
      }],
      config: { temperature: 0.2, maxOutputTokens: 256 },
    });

    const text = response.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (err) {
    logError("price-lookup", "Gemini analysis failed", err);
    return null;
  }
}

// ── Source management ──

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
