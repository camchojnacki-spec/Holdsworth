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

  const highConfidence = allFiltered.filter((l) => (l.matchScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD);
  log("price-lookup", `Scoring: ${allListings.length} total → ${allFiltered.length} passed (${highConfidence.length} high confidence, ${allListings.length - allFiltered.length} excluded)`, { jobId });

  // ══════════════════════════════════════════
  // LAYER 2: Gemini smart analysis
  // ══════════════════════════════════════════
  let estimateUsd: number | null = null;
  // Prefer high-confidence sold listings, then all sold, then all listings
  const highConfSold = soldFiltered.filter((l) => (l.matchScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD);
  const soldPrices = (highConfSold.length >= 3 ? highConfSold : soldFiltered).map((l) => l.price).sort((a, b) => a - b);
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
// LAYER 1: Scoring Matrix
// ══════════════════════════════════════════

/**
 * Score each listing against the card on multiple attributes.
 * Each attribute contributes weighted points to a total score (0-100).
 * Listings below the threshold are excluded.
 *
 * SCORING WEIGHTS:
 *   Card Number match:   35 pts  (strongest identifier)
 *   Player Name match:   20 pts  (must be the right player)
 *   Year match:          10 pts  (right year)
 *   Set/Product match:   10 pts  (Topps Series 1 vs Chrome vs Heritage)
 *   Parallel match:       15 pts (base vs Red vs Gold — critical for value)
 *   Condition match:      5 pts  (graded vs raw)
 *   No disqualifiers:     5 pts  (not a lot, not best-offer-strikethrough)
 *
 * THRESHOLD: 60/100 to include, 80/100 for high confidence
 */
const MATCH_THRESHOLD = 60;
const HIGH_CONFIDENCE_THRESHOLD = 80;

function preFilterListings(listings: SoldListing[], card: CardPricePayload): SoldListing[] {
  const cardNumber = card.cardNumber?.trim()?.toLowerCase() || "";
  const cardNumberVariants = cardNumber ? [
    cardNumber,
    cardNumber.replace(/-/g, " "),
    cardNumber.replace(/-/g, ""),
    `#${cardNumber}`,
  ] : [];

  const playerName = card.playerName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const playerLastName = playerName.split(/\s+/).pop() || playerName;

  const year = card.year ? String(card.year) : "";
  const setName = (card.setName || "").toLowerCase();
  const setWords = setName.split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "topps"].includes(w));

  const cardParallel = (card.parallelVariant || "").toLowerCase();
  const isBaseCard = !cardParallel || cardParallel === "base" || cardParallel === "base card";

  const colorParallels = ["red", "gold", "orange", "purple", "green", "pink", "black", "platinum",
    "superfractor", "sapphire", "magenta", "lava", "blue refractor", "gold refractor",
    "pink refractor", "orange refractor", "green refractor"];
  const lotIndicators = ["lot ", " lot", "bundle", " x2 ", " x3 ", " x4 ", " x5 ", "lot of", "card lot", "team lot"];
  const gradedIndicators = ["psa ", "bgs ", "sgc ", "cgc ", " psa", " bgs", " sgc", " cgc", "psa10", "psa9", "bgs9"];
  const numberedParallelRegex = /\/\s*(\d{1,4})\b/;

  return listings.map((listing) => {
    const titleLower = listing.title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    const breakdown: string[] = [];

    // ── Card Number (35 pts) ──
    if (cardNumberVariants.length > 0) {
      if (cardNumberVariants.some((v) => titleLower.includes(v))) {
        score += 35;
        breakdown.push("cardNum:35");
      } else {
        // Partial: check if any part of the card number appears
        const numParts = cardNumber.split(/[-\s]+/).filter((p) => p.length >= 2);
        const partialMatch = numParts.filter((p) => titleLower.includes(p)).length;
        if (partialMatch > 0 && numParts.length > 0) {
          const partialScore = Math.round(15 * (partialMatch / numParts.length));
          score += partialScore;
          breakdown.push(`cardNum:${partialScore}(partial)`);
        } else {
          breakdown.push("cardNum:0");
        }
      }
    } else {
      // No card number to match — give benefit of the doubt
      score += 20;
      breakdown.push("cardNum:20(unknown)");
    }

    // ── Player Name (20 pts) ──
    if (titleLower.includes(playerLastName)) {
      if (titleLower.includes(playerName)) {
        score += 20;
        breakdown.push("player:20");
      } else {
        score += 15; // Last name only
        breakdown.push("player:15(lastName)");
      }
    } else {
      breakdown.push("player:0");
    }

    // ── Year (10 pts) ──
    if (year && titleLower.includes(year)) {
      score += 10;
      breakdown.push("year:10");
    } else if (!year) {
      score += 5;
      breakdown.push("year:5(unknown)");
    } else {
      breakdown.push("year:0");
    }

    // ── Set/Product (10 pts) ──
    if (setWords.length > 0) {
      const setMatches = setWords.filter((w) => titleLower.includes(w)).length;
      const setScore = Math.round(10 * (setMatches / setWords.length));
      score += setScore;
      breakdown.push(`set:${setScore}`);
    } else {
      score += 5;
      breakdown.push("set:5(unknown)");
    }

    // ── Parallel (15 pts) ──
    if (isBaseCard) {
      // Base card: penalize if listing has numbered parallel or color variant
      const numMatch = titleLower.match(numberedParallelRegex);
      const hasShortPrint = numMatch && parseInt(numMatch[1]) <= 199;
      const hasColorParallel = colorParallels.some((color) => {
        const regex = new RegExp(`\\b${color}\\b(?!\\s+(sox|wings|bulls|storm))`, "i");
        return regex.test(listing.title);
      });

      if (hasShortPrint) {
        score -= 10; // Penalty — this is likely a different, more valuable card
        breakdown.push(`parallel:-10(/${numMatch![1]})`);
      } else if (hasColorParallel) {
        score -= 5;
        breakdown.push("parallel:-5(color)");
      } else {
        score += 15;
        breakdown.push("parallel:15(base)");
      }
    } else {
      // Specific parallel: check if it's mentioned
      const parallelWords = cardParallel.split(/\s+/).filter((w) => w.length > 2);
      const parallelMatches = parallelWords.filter((w) => titleLower.includes(w)).length;
      if (parallelMatches > 0 && parallelWords.length > 0) {
        const pScore = Math.round(15 * (parallelMatches / parallelWords.length));
        score += pScore;
        breakdown.push(`parallel:${pScore}`);
      } else {
        breakdown.push("parallel:0");
      }
    }

    // ── Condition type (5 pts) ──
    const isGradedListing = gradedIndicators.some((g) => titleLower.includes(g));
    if (card.graded && isGradedListing) {
      score += 5;
      breakdown.push("condition:5(graded)");
    } else if (!card.graded && !isGradedListing) {
      score += 5;
      breakdown.push("condition:5(raw)");
    } else {
      score -= 5; // Mismatch
      breakdown.push("condition:-5(mismatch)");
    }

    // ── Disqualifiers (5 pts) ──
    const isLot = lotIndicators.some((ind) => titleLower.includes(ind));
    if (isLot) {
      score -= 20; // Hard penalty
      breakdown.push("disqualify:-20(lot)");
    } else {
      score += 5;
      breakdown.push("disqualify:5(clean)");
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    const excluded = score < MATCH_THRESHOLD;

    if (excluded) {
      log("scoring", `EXCLUDED (${score}/100): "${listing.title.substring(0, 60)}..." [${breakdown.join(", ")}]`);
    }

    return {
      ...listing,
      matchScore: score,
      excluded,
      excludeReason: excluded ? `score ${score}/100 < threshold ${MATCH_THRESHOLD} [${breakdown.join(", ")}]` : undefined,
    };
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
