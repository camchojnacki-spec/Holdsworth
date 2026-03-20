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
  saleType?: string | null;
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
  const { getUsdToCad } = await import("./currency-update");
  const usdToCad = await getUsdToCad();

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
          saleType: listing.saleType,
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

  // NOTE: Link verification disabled — eBay sold item URLs from 130point
  // often redirect (item ended) but are still viewable. HEAD checks were
  // clearing valid links. Users can validate links manually in the UI.

  // ── Store individual comps (only good matches) ──
  if (allFiltered.length > 0) {
    const sourceMap = await ensureSources();

    for (const listing of allFiltered.slice(0, 20)) {
      const sourceId = listing.source === "ebay-active"
        ? sourceMap["eBay Active"]
        : sourceMap["130point"];
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
          listingTitle: listing.title?.substring(0, 500) || null,
          matchScore: listing.matchScore ?? null,
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
// LAYER 1: Multi-Dimension Scoring Matrix
// ══════════════════════════════════════════

/**
 * Score each listing against the card across many dimensions.
 *
 * PHASE 1 — Raw additive score (0-100):
 *   Card Number:       25 pts  (strongest single identifier)
 *   Player Full Name:  15 pts  (both first + last)
 *   Player Last Name:   8 pts  (fallback if full name missing)
 *   Year:              10 pts  (right year)
 *   Set/Product:        8 pts  (Archives vs Chrome vs Heritage)
 *   Manufacturer:       4 pts  (Topps vs Panini)
 *   Insert/Subset:      5 pts  (Fan Favorite, Gold Label, etc.)
 *   Autograph match:    5 pts  (auto in title when card is auto)
 *   Rookie match:       3 pts  (RC in title when card is RC)
 *   Condition type:     5 pts  (graded vs raw match)
 *   Recency:            5 pts  (sold within last 90 days)
 *   Clean listing:      5 pts  (no lots, no best-offer)
 *   Title completeness: 5 pts  (bonus for titles with many matching attributes)
 *   Best Offer:       -25 pts  (price unreliable)
 *   Lot/Bundle:       -30 pts  (not a single card)
 *
 * PHASE 2 — Parallel multiplier:
 *   Base card + base listing: ×1.0  (no penalty)
 *   Base card + /1-25:        ×0.15
 *   Base card + /26-99:       ×0.25
 *   Base card + /100-199:     ×0.40
 *   Base card + color:        ×0.50
 *   Parallel match:           ×1.0
 *   Parallel miss:            ×0.35
 *
 * THRESHOLD: 55/100 to include, 75/100 for high confidence
 */
const MATCH_THRESHOLD = 55;
const HIGH_CONFIDENCE_THRESHOLD = 75;

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
  const playerFirstName = playerName.split(/\s+/)[0] || "";
  const playerLastName = playerName.split(/\s+/).pop() || playerName;

  const year = card.year ? String(card.year) : "";
  const setName = (card.setName || "").toLowerCase();
  const setWords = setName.split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "topps", "baseball"].includes(w));

  const manufacturer = (card.manufacturer || "").toLowerCase();
  const insertSet = (card.subsetOrInsert || "").toLowerCase();
  const insertWords = insertSet.split(/\s+/).filter((w) => w.length > 2);

  const cardParallel = (card.parallelVariant || "").toLowerCase();
  const isBaseCard = !cardParallel || cardParallel === "base" || cardParallel === "base card";

  const colorParallels = ["red", "gold", "orange", "purple", "green", "pink", "black", "platinum",
    "superfractor", "sapphire", "magenta", "lava", "blue refractor", "gold refractor",
    "pink refractor", "orange refractor", "green refractor", "foil", "chrome", "prizm",
    "shimmer", "camo", "rainbow", "ice", "silver"];
  const lotIndicators = ["lot ", " lot", "bundle", " x2 ", " x3 ", " x4 ", " x5 ", "lot of", "card lot", "team lot"];
  const gradedIndicators = ["psa ", "bgs ", "sgc ", "cgc ", " psa", " bgs", " sgc", " cgc", "psa10", "psa9", "bgs9"];
  const autoIndicators = ["auto ", " auto", "autograph", "auto/", "/auto", "on-card auto", "on card auto"];
  const rookieIndicators = [" rc ", " rc", "rookie", "#/rc"];
  const numberedParallelRegex = /\/\s*(\d{1,4})\b/;

  return listings.map((listing) => {
    const titleLower = listing.title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let rawScore = 0;
    const breakdown: string[] = [];
    let dimensionHits = 0; // Track how many dimensions matched for completeness bonus

    // ── Card Number (25 pts) ──
    if (cardNumberVariants.length > 0) {
      if (cardNumberVariants.some((v) => titleLower.includes(v))) {
        rawScore += 25;
        breakdown.push("cardNum:25");
        dimensionHits++;
      } else {
        const numParts = cardNumber.split(/[-\s]+/).filter((p) => p.length >= 2);
        const partialMatch = numParts.filter((p) => titleLower.includes(p)).length;
        if (partialMatch > 0 && numParts.length > 0) {
          const partialScore = Math.round(10 * (partialMatch / numParts.length));
          rawScore += partialScore;
          breakdown.push(`cardNum:${partialScore}(partial)`);
          dimensionHits += 0.5;
        } else {
          breakdown.push("cardNum:0");
        }
      }
    } else {
      rawScore += 12;
      breakdown.push("cardNum:12(unknown)");
    }

    // ── Player Name (15 pts full, 8 pts last-only) ──
    const hasLastName = titleLower.includes(playerLastName);
    const hasFirstName = playerFirstName.length > 2 && titleLower.includes(playerFirstName);
    if (hasLastName && hasFirstName) {
      rawScore += 15;
      breakdown.push("player:15");
      dimensionHits++;
    } else if (hasLastName) {
      rawScore += 8;
      breakdown.push("player:8(lastName)");
      dimensionHits += 0.5;
    } else {
      breakdown.push("player:0");
    }

    // ── Year (10 pts) ──
    if (year && titleLower.includes(year)) {
      rawScore += 10;
      breakdown.push("year:10");
      dimensionHits++;
    } else if (!year) {
      rawScore += 5;
      breakdown.push("year:5(unknown)");
    } else {
      breakdown.push("year:0");
    }

    // ── Set/Product (8 pts) ──
    if (setWords.length > 0) {
      const setMatches = setWords.filter((w) => titleLower.includes(w)).length;
      const setScore = Math.round(8 * (setMatches / setWords.length));
      rawScore += setScore;
      breakdown.push(`set:${setScore}`);
      if (setScore >= 5) dimensionHits++;
    } else {
      rawScore += 3;
      breakdown.push("set:3(unknown)");
    }

    // ── Manufacturer (4 pts) ──
    if (manufacturer && manufacturer.length > 2) {
      if (titleLower.includes(manufacturer)) {
        rawScore += 4;
        breakdown.push("mfg:4");
        dimensionHits++;
      } else {
        breakdown.push("mfg:0");
      }
    } else {
      rawScore += 2;
      breakdown.push("mfg:2(unknown)");
    }

    // ── Insert/Subset (5 pts) ──
    if (insertWords.length > 0) {
      const insertMatches = insertWords.filter((w) => titleLower.includes(w)).length;
      const insertScore = Math.round(5 * (insertMatches / insertWords.length));
      rawScore += insertScore;
      breakdown.push(`insert:${insertScore}`);
      if (insertScore >= 3) dimensionHits++;
    } else {
      rawScore += 2;
      breakdown.push("insert:2(none)");
    }

    // ── Autograph match (5 pts) ──
    const listingHasAuto = autoIndicators.some((a) => titleLower.includes(a));
    if (card.isAutograph && listingHasAuto) {
      rawScore += 5;
      breakdown.push("auto:5");
      dimensionHits++;
    } else if (card.isAutograph && !listingHasAuto) {
      rawScore -= 3; // Card is auto but listing doesn't mention it — suspicious
      breakdown.push("auto:-3(missing)");
    } else if (!card.isAutograph && listingHasAuto) {
      rawScore -= 3; // Listing is auto but card isn't
      breakdown.push("auto:-3(extra)");
    } else {
      rawScore += 2; // Both non-auto, consistent
      breakdown.push("auto:2(match)");
    }

    // ── Rookie match (3 pts) ──
    const listingHasRC = rookieIndicators.some((r) => titleLower.includes(r));
    if (listingHasRC) {
      rawScore += 3;
      breakdown.push("rc:3");
      dimensionHits += 0.5;
    } else {
      breakdown.push("rc:0");
    }

    // ── Condition type (5 pts) ──
    const isGradedListing = gradedIndicators.some((g) => titleLower.includes(g));
    if (card.graded && isGradedListing) {
      rawScore += 5;
      breakdown.push("cond:5(graded)");
      dimensionHits++;
    } else if (!card.graded && !isGradedListing) {
      rawScore += 5;
      breakdown.push("cond:5(raw)");
      dimensionHits++;
    } else {
      rawScore -= 8; // Graded vs raw is a big value difference
      breakdown.push("cond:-8(mismatch)");
    }

    // ── Recency (5 pts) ──
    if (listing.date && listing.date !== "active") {
      const saleDate = new Date(listing.date);
      const daysSinceSale = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24);
      if (!isNaN(daysSinceSale)) {
        if (daysSinceSale <= 30) {
          rawScore += 5;
          breakdown.push("recency:5(<30d)");
        } else if (daysSinceSale <= 90) {
          rawScore += 3;
          breakdown.push("recency:3(<90d)");
        } else if (daysSinceSale <= 180) {
          rawScore += 1;
          breakdown.push("recency:1(<180d)");
        } else {
          breakdown.push("recency:0(old)");
        }
      } else {
        breakdown.push("recency:0(noDate)");
      }
    } else if (listing.date === "active") {
      rawScore += 4; // Active listings are current market
      breakdown.push("recency:4(active)");
    } else {
      breakdown.push("recency:0(noDate)");
    }

    // ── Title Completeness bonus (5 pts) ──
    // Reward listings whose titles match many card attributes
    if (dimensionHits >= 7) {
      rawScore += 5;
      breakdown.push("complete:5");
    } else if (dimensionHits >= 5) {
      rawScore += 3;
      breakdown.push("complete:3");
    } else if (dimensionHits >= 3) {
      rawScore += 1;
      breakdown.push("complete:1");
    } else {
      breakdown.push("complete:0");
    }

    // ── Disqualifiers (5 pts clean / penalties) ──
    const isLot = lotIndicators.some((ind) => titleLower.includes(ind));
    const isBestOffer = titleLower.includes("best offer") ||
      listing.title.includes("Best Offer") ||
      listing.saleType === "best_offer";
    if (isLot) {
      rawScore -= 30;
      breakdown.push("disq:-30(lot)");
    } else if (isBestOffer) {
      rawScore -= 25; // Price shown is unreliable
      breakdown.push("disq:-25(bestOffer)");
    } else {
      rawScore += 5;
      breakdown.push("disq:5(clean)");
    }

    // Clamp raw score to 0-100
    rawScore = Math.max(0, Math.min(100, rawScore));

    // ══ PHASE 2: Parallel multiplier ══

    let parallelMultiplier = 1.0;

    if (isBaseCard) {
      const numMatch = titleLower.match(numberedParallelRegex);
      const hasNumberedPrint = numMatch && parseInt(numMatch[1]) <= 199;
      const hasColorParallel = colorParallels.some((color) => {
        const regex = new RegExp(`\\b${color}\\b(?!\\s+(sox|wings|bulls|storm))`, "i");
        return regex.test(listing.title);
      });

      if (hasNumberedPrint) {
        const printRun = parseInt(numMatch![1]);
        parallelMultiplier = printRun <= 25 ? 0.15 : printRun <= 99 ? 0.25 : 0.40;
        breakdown.push(`parallel:×${parallelMultiplier}(/${printRun})`);
      } else if (hasColorParallel) {
        parallelMultiplier = 0.50;
        breakdown.push("parallel:×0.5(color)");
      } else {
        breakdown.push("parallel:×1.0(base)");
      }
    } else {
      const parallelWords = cardParallel.split(/\s+/).filter((w) => w.length > 2);
      const parallelMatches = parallelWords.filter((w) => titleLower.includes(w)).length;
      if (parallelMatches > 0 && parallelWords.length > 0 &&
          parallelMatches / parallelWords.length >= 0.5) {
        breakdown.push("parallel:×1.0(match)");
      } else {
        parallelMultiplier = 0.35;
        breakdown.push("parallel:×0.35(miss)");
      }
    }

    // Final score
    let score = Math.round(rawScore * parallelMultiplier);
    score = Math.max(0, Math.min(100, score));

    const excluded = score < MATCH_THRESHOLD;

    if (excluded) {
      log("scoring", `EXCLUDED (${score}/100, raw:${rawScore}): "${listing.title.substring(0, 60)}..." [${breakdown.join(", ")}]`);
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
// Link Verification
// ══════════════════════════════════════════

/**
 * HEAD-check sold listing URLs to weed out dead eBay links.
 * Only checks 130point/sold source links (active eBay listings are current).
 * Runs in parallel with a 3s timeout per request.
 */
async function verifyLinks(listings: SoldListing[]): Promise<void> {
  const soldListings = listings.filter((l) => l.source === "130point" && l.url);
  if (soldListings.length === 0) return;

  const toCheck = soldListings.slice(0, 20);
  log("link-check", `Verifying ${toCheck.length} sold listing links`);

  const results = await Promise.allSettled(
    toCheck.map(async (listing) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(listing.url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        clearTimeout(timeout);

        // eBay returns 200 for "item not found" pages — check for redirects to error pages
        const finalUrl = res.url || listing.url;
        const isDead = res.status === 404 ||
          res.status >= 500 ||
          finalUrl.includes("/error") ||
          finalUrl.includes("PageNotFound");

        if (isDead) {
          listing.url = ""; // Clear dead link
        }
      } catch {
        // Timeout or network error — keep the link (benefit of the doubt)
      }
    })
  );

  const deadCount = toCheck.filter((l) => l.url === "").length;
  if (deadCount > 0) {
    log("link-check", `Cleared ${deadCount} dead links`);
  }
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
  if (sourceCache["130point"] && sourceCache["eBay Active"]) return sourceCache;

  for (const [name, baseUrl, type] of [
    ["130point", "https://130point.com", "api"],
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
