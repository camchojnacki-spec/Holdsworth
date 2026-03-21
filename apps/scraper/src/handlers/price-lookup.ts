import { db, priceEstimates, priceSources, priceHistory, cards, sets, setProducts, referenceCards, parallelTypes, playerCanonical } from "@holdsworth/db";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { scrape130Point } from "../scrapers/scrape-130point";
import { scrapeEbayApi } from "../scrapers/scrape-ebay-api";
import { buildSearchQueries } from "../scrapers/query-builder";
import { parseSaleDate } from "../lib/dates";
import { log, logError } from "../lib/logger";
import type { CardPricePayload } from "@holdsworth/db";

// ── Gemini singleton (B-026) ──
let _geminiInstance: InstanceType<typeof GoogleGenAI> | null = null;
function getGemini(): InstanceType<typeof GoogleGenAI> {
  if (!_geminiInstance) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");
    _geminiInstance = new GoogleGenAI({ apiKey });
  }
  return _geminiInstance;
}

interface SoldListing {
  title: string;
  price: number;
  date: string;
  source: string;
  url: string;
  searchUrl?: string; // 130point search page URL for the user to visit
  saleType?: string | null;
  matchScore?: number;
  aiVerdict?: "exact" | "close" | "wrong";
  aiReason?: string;
  excluded?: boolean;
  excludeReason?: string;
}

/** Reference data resolved from the DB for a card */
interface CardReferenceData {
  referenceCardId: string;
  confirmedSetProduct: string;
  setProductId: string;
  confirmedParallel: { name: string; printRun: number | null; colorFamily: string | null } | null;
  parallelTypeId: string | null;
  priceMultiplier: number | null;
}

/**
 * Look up reference data for a card from the reference DB.
 * Returns null if no reference match exists.
 */
async function getCardReferenceData(
  cardId: string,
  _payload: CardPricePayload
): Promise<CardReferenceData | null> {
  try {
    // Step 1: Look up the card to get referenceCardId and setId
    const [card] = await db
      .select({
        referenceCardId: cards.referenceCardId,
        setId: cards.setId,
        parallelVariant: cards.parallelVariant,
      })
      .from(cards)
      .where(eq(cards.id, cardId))
      .limit(1);

    if (!card) return null;

    let setProductId: string | null = null;
    let confirmedSetProduct: string | null = null;

    // Step 2a: If we have a referenceCardId, get set product info via reference card
    if (card.referenceCardId) {
      const [refCard] = await db
        .select({
          setProductId: referenceCards.setProductId,
          setProductName: setProducts.name,
          setProductYear: setProducts.year,
        })
        .from(referenceCards)
        .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
        .where(eq(referenceCards.id, card.referenceCardId))
        .limit(1);

      if (refCard) {
        setProductId = refCard.setProductId;
        confirmedSetProduct = refCard.setProductName;
      }
    }

    // Step 2b: Fallback — if no reference card, try via the set's setProductId
    if (!setProductId && card.setId) {
      const [setRow] = await db
        .select({
          setProductId: sets.setProductId,
          setProductName: setProducts.name,
        })
        .from(sets)
        .innerJoin(setProducts, eq(sets.setProductId, setProducts.id))
        .where(eq(sets.id, card.setId))
        .limit(1);

      if (setRow?.setProductId) {
        setProductId = setRow.setProductId;
        confirmedSetProduct = setRow.setProductName;
      }
    }

    if (!setProductId || !confirmedSetProduct) return null;

    // Step 3: Look up parallel details if the card has a parallel variant
    let confirmedParallel: CardReferenceData["confirmedParallel"] = null;
    let parallelTypeId: string | null = null;
    let priceMultiplier: number | null = null;

    if (card.parallelVariant && !["base", "base card"].includes(card.parallelVariant.toLowerCase())) {
      const parallelVariantLower = card.parallelVariant.toLowerCase();

      // Find the matching parallel type for this set product
      const matchingParallels = await db
        .select({
          id: parallelTypes.id,
          name: parallelTypes.name,
          printRun: parallelTypes.printRun,
          colorFamily: parallelTypes.colorFamily,
          priceMultiplier: parallelTypes.priceMultiplier,
        })
        .from(parallelTypes)
        .where(eq(parallelTypes.setProductId, setProductId));

      // Find the best match by name
      const match = matchingParallels.find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(parallelVariantLower) || parallelVariantLower.includes(pName.replace(/\s*\/\s*\d+$/, "").trim());
      });

      if (match) {
        confirmedParallel = {
          name: match.name,
          printRun: match.printRun,
          colorFamily: match.colorFamily,
        };
        parallelTypeId = match.id;
        priceMultiplier = match.priceMultiplier ? parseFloat(String(match.priceMultiplier)) : null;
      }
    }

    return {
      referenceCardId: card.referenceCardId || "",
      confirmedSetProduct,
      setProductId,
      confirmedParallel,
      parallelTypeId,
      priceMultiplier,
    };
  } catch (err) {
    logError("price-lookup", "Failed to look up reference data", err);
    return null;
  }
}

/**
 * Execute a price lookup job.
 *
 * Pipeline:
 *   1. Look up reference data (if available)
 *   2. Build queries (reference-enhanced when possible)
 *   3. Scrape 130point + eBay API
 *   4. Fast pre-filter (keyword scoring — cheap, removes obvious junk)
 *   5. Gemini comp validation (AI looks at each surviving listing and decides
 *      if it's actually the same card — catches "Texas Taters" type mismatches)
 *   6. If < 3 validated comps, Gemini suggests comparable players and we
 *      search for those with the exact same set/year/parallel
 *   6b. Parallel hierarchy bracketing (when exact comps are scarce)
 *   7. Gemini price analysis on validated comps
 *   7b. Print run multiplier fallback (when all else fails)
 *   8. Store results
 */
export async function handlePriceLookup(
  jobId: string,
  cardId: string,
  payload: CardPricePayload
): Promise<{ success: boolean; listingCount: number; filteredCount: number; estimateUsd: number | null; sources: string[] }> {

  // ── Look up reference data for this card if available ──
  const refData = await getCardReferenceData(cardId, payload);

  if (refData) {
    log("price-lookup", `Reference data found: set="${refData.confirmedSetProduct}", parallel=${refData.confirmedParallel?.name ?? "none"}, multiplier=${refData.priceMultiplier ?? "none"}`, { jobId, cardId });
  }

  // Build queries with reference data when available
  const queryInput = {
    ...payload,
    ...(refData ? {
      referenceCardId: refData.referenceCardId,
      confirmedSetProduct: refData.confirmedSetProduct,
      confirmedParallel: refData.confirmedParallel ?? undefined,
    } : {}),
  };

  const queries = buildSearchQueries(queryInput);
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
          searchUrl: result.url, // 130point search page URL
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
  // LAYER 1: Fast keyword pre-filter (free, instant)
  // Removes obvious junk: lots, wrong sport, clearly wrong cards
  // ══════════════════════════════════════════
  const preFiltered = preFilterListings(allListings, payload);
  const survivedPreFilter = preFiltered.filter((l) => !l.excluded);

  log("price-lookup", `Pre-filter: ${allListings.length} total → ${survivedPreFilter.length} survived keyword scoring`, { jobId });

  // ══════════════════════════════════════════
  // LAYER 2: Gemini comp validation (smart, catches semantic mismatches)
  // This is the key intelligence — Gemini examines each listing title and
  // decides if it's actually the same card. "Texas Taters" gets rejected.
  // ══════════════════════════════════════════
  let validated: SoldListing[];
  if (survivedPreFilter.length > 0) {
    validated = await validateCompsWithGemini(payload, survivedPreFilter);
    log("price-lookup", `Gemini validation: ${survivedPreFilter.length} → ${validated.filter(l => !l.excluded).length} confirmed matches`, { jobId });
  } else {
    validated = [];
  }

  const confirmedComps = validated.filter((l) => !l.excluded);
  const soldConfirmed = confirmedComps.filter((l) => l.source !== "ebay-active");
  const exactSoldCount = soldConfirmed.filter((l) => l.aiVerdict === "exact").length;

  // ══════════════════════════════════════════
  // LAYER 3: Comparable player search (when exact comps are sparse)
  // Triggers when fewer than 5 EXACT sold comps — not total comps.
  // This ensures comparable player data is available even when we have
  // some "close" matches (wrong parallel, adjacent year, etc.)
  // ══════════════════════════════════════════
  if (exactSoldCount < 5) {
    log("price-lookup", `Only ${exactSoldCount} exact sold comps (${soldConfirmed.length} total) — searching comparable players`, { jobId });
    const comparableComps = await findComparablePlayerComps(payload, usdToCad);
    if (comparableComps.length > 0) {
      log("price-lookup", `Found ${comparableComps.length} comparable player comps`, { jobId });
      confirmedComps.push(...comparableComps);
    }
  }

  // ══════════════════════════════════════════
  // LAYER 3b: Parallel hierarchy bracketing
  // When exact comps for a specific parallel are scarce, find adjacent
  // parallels by print run to establish a price bracket.
  // ══════════════════════════════════════════
  let bracketContext = "";
  if (refData?.setProductId && exactSoldCount < 3) {
    const bracket = await bracketPriceFromParallelHierarchy(payload, confirmedComps, refData.setProductId);
    if (bracket && (bracket.bracketLow !== null || bracket.bracketHigh !== null)) {
      const parts: string[] = [];
      if (bracket.bracketHigh !== null) {
        parts.push(`higher-rarity adjacent parallel sells for ~$${bracket.bracketHigh}`);
      }
      if (bracket.bracketLow !== null) {
        parts.push(`lower-rarity adjacent parallel sells for ~$${bracket.bracketLow}`);
      }
      bracketContext = `\nPARALLEL BRACKET DATA: ${parts.join("; ")}. This card's parallel should be priced between these.`;
      log("price-lookup", `Parallel bracket: low=$${bracket.bracketLow}, high=$${bracket.bracketHigh}`, { jobId });
    }
  }

  // ══════════════════════════════════════════
  // LAYER 4: Gemini price analysis
  // ══════════════════════════════════════════
  let estimateUsd: number | null = null;
  let estimateNotes: string | null = null;
  const soldComps = confirmedComps.filter((l) => l.source !== "ebay-active");
  const allPrices = confirmedComps.map((l) => l.price).sort((a, b) => a - b);
  const soldPrices = soldComps.map((l) => l.price).sort((a, b) => a - b);
  const prices = soldPrices.length > 0 ? soldPrices : allPrices;

  if (prices.length > 0) {
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const median = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    const aiResult = await analyzeWithGemini(payload, confirmedComps, {
      count: prices.length,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      low: prices[0],
      high: prices[prices.length - 1],
    }, bracketContext);

    estimateUsd = aiResult?.mid ?? Math.round(median * 100) / 100;
    estimateNotes = aiResult?.notes ?? null;
    const estimateCad = Math.round(estimateUsd * usdToCad * 100) / 100;

    // Calculate trend by comparing with previous estimate
    let priceTrend = "stable";
    let trendPct = "0";
    const [prevEstimate] = await db
      .select({ usd: priceEstimates.estimatedValueUsd })
      .from(priceEstimates)
      .where(eq(priceEstimates.cardId, cardId))
      .limit(1);
    if (prevEstimate?.usd) {
      const prevUsd = parseFloat(prevEstimate.usd);
      if (prevUsd > 0) {
        const pctChange = ((estimateUsd - prevUsd) / prevUsd) * 100;
        trendPct = String(Math.round(pctChange));
        if (pctChange >= 5) priceTrend = "up";
        else if (pctChange <= -5) priceTrend = "down";
      }
    }

    // Confidence based on confirmed comps quality
    const exactCount = confirmedComps.filter(l => l.aiVerdict === "exact").length;
    const closeCount = confirmedComps.filter(l => l.aiVerdict === "close").length;
    const avgMatchScore = confirmedComps.length > 0
      ? confirmedComps.reduce((sum, l) => sum + (l.matchScore ?? 0), 0) / confirmedComps.length
      : 0;

    let confidence: string;
    if (exactCount >= 5 && avgMatchScore >= 70) confidence = "high";
    else if (exactCount >= 3 && avgMatchScore >= 60) confidence = "high";
    else if (exactCount >= 2 || (exactCount >= 1 && closeCount >= 2)) confidence = "medium";
    else confidence = "low";

    const sampleSize = soldComps.length || confirmedComps.length;

    // Upsert price estimate
    await db
      .insert(priceEstimates)
      .values({
        cardId,
        estimatedValueUsd: String(estimateUsd),
        estimatedValueCad: String(estimateCad),
        confidence,
        sampleSize,
        priceTrend,
        trendPercentage: trendPct,
      })
      .onConflictDoUpdate({
        target: priceEstimates.cardId,
        set: {
          estimatedValueUsd: String(estimateUsd),
          estimatedValueCad: String(estimateCad),
          confidence,
          sampleSize,
          priceTrend,
          trendPercentage: trendPct,
          lastUpdated: new Date(),
        },
      });

    log("price-lookup", `Stored estimate: $${estimateUsd} USD ($${estimateCad} CAD) — ${exactCount} exact, ${closeCount} close comps${estimateNotes ? ` — ${estimateNotes}` : ""}`, { jobId, cardId });
  } else {
    log("price-lookup", "No validated listings after Gemini filtering", { jobId, cardId });
  }

  // ══════════════════════════════════════════
  // LAYER 4b: Print Run Multiplier Fallback
  // When estimate is still null but we have reference data with a
  // priceMultiplier, estimate from base card comps × multiplier.
  // ══════════════════════════════════════════
  if (estimateUsd === null && refData?.priceMultiplier && refData.priceMultiplier > 0) {
    const baseEstimate = await getBaseCardEstimate(cardId, payload, refData);
    if (baseEstimate !== null) {
      estimateUsd = Math.round(baseEstimate * refData.priceMultiplier * 100) / 100;
      const estimateCad = Math.round(estimateUsd * usdToCad * 100) / 100;

      log("price-lookup", `Multiplier fallback: base $${baseEstimate} × ${refData.priceMultiplier} = $${estimateUsd} USD`, { jobId, cardId });

      await db
        .insert(priceEstimates)
        .values({
          cardId,
          estimatedValueUsd: String(estimateUsd),
          estimatedValueCad: String(estimateCad),
          confidence: "low",
          sampleSize: 0,
          priceTrend: "stable",
          trendPercentage: "0",
        })
        .onConflictDoUpdate({
          target: priceEstimates.cardId,
          set: {
            estimatedValueUsd: String(estimateUsd),
            estimatedValueCad: String(estimateCad),
            confidence: "low",
            sampleSize: 0,
            priceTrend: "stable",
            trendPercentage: "0",
            lastUpdated: new Date(),
          },
        });

      log("price-lookup", `Stored multiplier-based estimate: $${estimateUsd} USD (low confidence — no direct comps, derived from base × ${refData.priceMultiplier})`, { jobId, cardId });
    }
  }

  // ══════════════════════════════════════════
  // LAYER 5: Dead Link Verification
  // HEAD-request the top comps to weed out expired eBay links (130point URLs
  // to eBay expire after ~90 days). Nullify dead URLs so UI doesn't show broken links.
  // ══════════════════════════════════════════
  // Check all comps we'll store (confirmed + top excluded)
  const allCompsForStorage = [
    ...confirmedComps,
    ...validated.filter(l => l.excluded && (l.matchScore ?? 0) > 0)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)),
  ].slice(0, 20);
  if (allCompsForStorage.length > 0) {
    const compsToCheck = allCompsForStorage.filter(l => l.url && l.source !== "ebay-active");
    if (compsToCheck.length > 0) {
      log("price-lookup", `Checking ${compsToCheck.length} listing URLs for dead links`, { jobId });
      const results = await Promise.allSettled(
        compsToCheck.map(async (listing) => {
          try {
            const resp = await fetch(listing.url, {
              method: "HEAD",
              redirect: "follow",
              signal: AbortSignal.timeout(3000),
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            });
            // eBay shows an error page (not 404) for expired items, but often redirects
            const finalUrl = resp.url || listing.url;
            const isDead = resp.status === 404 ||
              finalUrl.includes("ebay.com/itm/not-found") ||
              finalUrl.includes("ebay.com/help/") ||
              resp.status >= 500;
            return { listing, isDead };
          } catch {
            // Timeout or network error — don't kill the link, it might just be slow
            return { listing, isDead: false };
          }
        })
      );
      let deadCount = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.isDead) {
          result.value.listing.url = ""; // Nullify dead link
          deadCount++;
        }
      }
      if (deadCount > 0) {
        log("price-lookup", `Removed ${deadCount} dead links`, { jobId });
      }
    }
  }

  // ── Store individual comps ──
  // Store ALL scored comps (confirmed + excluded) so the user always has links
  // to manually validate. Confirmed comps go first (highest quality), then
  // excluded comps sorted by score descending (for manual review).
  // The matchScore tells the user how confident we are about each comp.
  const compsToStore = [
    ...confirmedComps,
    ...validated.filter(l => l.excluded && (l.matchScore ?? 0) > 0)
      .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)),
  ].slice(0, 20);

  if (compsToStore.length > 0) {
    const sourceMap = await ensureSources();

    for (const listing of compsToStore) {
      const sourceId = listing.source === "ebay-active"
        ? sourceMap["eBay Active"]
        : listing.source === "comparable"
        ? sourceMap["130point"] // comparable player comps come from 130point
        : sourceMap["130point"];
      if (!sourceId) continue;

      // Store the actual eBay item URL (from 130point scraping) or the
      // eBay active listing URL. These are the real links users can click.
      // 130point search URLs don't work (it's a JS SPA).
      const storedUrl = listing.url || null;

      try {
        await db.insert(priceHistory).values({
          cardId,
          sourceId,
          priceUsd: String(listing.price),
          priceCad: String(Math.round(listing.price * usdToCad * 100) / 100),
          currencyRate: String(usdToCad),
          saleDate: parseSaleDate(listing.date),
          listingUrl: storedUrl,
          listingTitle: listing.title?.substring(0, 500) || null,
          matchScore: listing.matchScore ?? null,
          condition: null,
          graded: false,
          // Reference DB FKs for direct aggregation
          referenceCardId: refData?.referenceCardId || null,
          parallelTypeId: refData?.parallelTypeId || null,
          setProductId: refData?.setProductId || null,
        });
      } catch (err) {
        logError("price-lookup", `Failed to insert comp`, err);
      }
    }

    log("price-lookup", `Stored ${compsToStore.length} comps (${confirmedComps.length} confirmed + ${compsToStore.length - confirmedComps.length} for review)`, { jobId, cardId });
  }

  // ── Low-confidence gap detection (Sprint 6) ──
  // Flag cards with poor pricing for reference issues or missing data
  if (confirmedComps.length < 3 || !estimateUsd) {
    try {
      const { notifications } = await import("@holdsworth/db");
      const confidenceLevel = confirmedComps.length === 0 ? "very_low" : "low";

      if (refData?.referenceCardId) {
        // Has reference data but still low confidence — possible reference mismatch
        await db.insert(notifications).values({
          type: "stale_price",
          title: "Low-confidence pricing",
          message: `Card ${payload.playerName || "Unknown"} (${payload.year || ""} ${payload.setName || ""}) has ${confidenceLevel} confidence with ${confirmedComps.length} comps. Reference data may need review.`,
          cardId,
          metadata: { confidence: confidenceLevel, comps: confirmedComps.length, hasReference: true },
        });
      }
      // If no reference data, the scan-triggered import in scanner.ts handles it
    } catch {
      // Non-critical
    }
  }

  return {
    success: confirmedComps.length > 0 || estimateUsd !== null,
    listingCount: allListings.length,
    filteredCount: confirmedComps.length,
    estimateUsd,
    sources,
  };
}

// ══════════════════════════════════════════
// Parallel Hierarchy Bracketing
// ══════════════════════════════════════════

/**
 * When exact comps for a specific parallel are scarce (<3), find adjacent
 * parallels by print run and search for their sold comps to create a price bracket.
 *
 * e.g. If the card is /75, find the /50 (rarer, higher price) and /99 (more common, lower price)
 * parallels and search for those to establish bracket bounds.
 */
async function bracketPriceFromParallelHierarchy(
  card: CardPricePayload,
  confirmedComps: SoldListing[],
  setProductId: string
): Promise<{ bracketLow: number | null; bracketHigh: number | null } | null> {
  try {
    // Get all parallels for this set product, sorted by print run
    const allParallels = await db
      .select({
        name: parallelTypes.name,
        printRun: parallelTypes.printRun,
        colorFamily: parallelTypes.colorFamily,
      })
      .from(parallelTypes)
      .where(eq(parallelTypes.setProductId, setProductId));

    if (allParallels.length < 2) return null;

    // Find our card's parallel in the list
    const cardParallel = (card.parallelVariant || "").toLowerCase();
    const currentParallel = allParallels.find((p) => {
      const pName = p.name.toLowerCase();
      return pName.includes(cardParallel) || cardParallel.includes(pName.replace(/\s*\/\s*\d+$/, "").trim());
    });

    if (!currentParallel?.printRun) return null;

    // Sort parallels by print run (ascending = rarest first)
    const numbered = allParallels
      .filter((p) => p.printRun && p.printRun > 0)
      .sort((a, b) => (a.printRun ?? 0) - (b.printRun ?? 0));

    const currentIdx = numbered.findIndex((p) => p.printRun === currentParallel.printRun);
    if (currentIdx === -1) return null;

    // Adjacent rarer parallel (lower print run = higher value = bracketHigh)
    const rarerParallel = currentIdx > 0 ? numbered[currentIdx - 1] : null;
    // Adjacent more common parallel (higher print run = lower value = bracketLow)
    const commonerParallel = currentIdx < numbered.length - 1 ? numbered[currentIdx + 1] : null;

    let bracketHigh: number | null = null;
    let bracketLow: number | null = null;

    // Search for rarer parallel comps
    if (rarerParallel) {
      const rarerTag = rarerParallel.printRun ? `${rarerParallel.name.replace(/\s*\/\s*\d+$/, "").trim()} /${rarerParallel.printRun}` : rarerParallel.name;
      const query = [card.year, card.setName, card.playerName, rarerTag].filter(Boolean).join(" ");
      log("bracket", `Searching rarer parallel: "${query}"`);
      const result = await scrape130Point(query);
      if (result.success && result.listings.length > 0) {
        const prices = result.listings.slice(0, 5).map((l) => l.price).sort((a, b) => a - b);
        bracketHigh = prices[Math.floor(prices.length / 2)]; // median
      }
    }

    // Search for more common parallel comps
    if (commonerParallel) {
      const commonerTag = commonerParallel.printRun ? `${commonerParallel.name.replace(/\s*\/\s*\d+$/, "").trim()} /${commonerParallel.printRun}` : commonerParallel.name;
      const query = [card.year, card.setName, card.playerName, commonerTag].filter(Boolean).join(" ");
      log("bracket", `Searching commoner parallel: "${query}"`);
      const result = await scrape130Point(query);
      if (result.success && result.listings.length > 0) {
        const prices = result.listings.slice(0, 5).map((l) => l.price).sort((a, b) => a - b);
        bracketLow = prices[Math.floor(prices.length / 2)]; // median
      }
    }

    if (bracketLow === null && bracketHigh === null) return null;

    return { bracketLow, bracketHigh };
  } catch (err) {
    logError("bracket", "Parallel hierarchy bracketing failed", err);
    return null;
  }
}

// ══════════════════════════════════════════
// Print Run Multiplier Fallback
// ══════════════════════════════════════════

/**
 * Get the base card median price for this player/set to use with the multiplier fallback.
 * Searches for the base version of the same card and returns the median sold price.
 */
async function getBaseCardEstimate(
  _cardId: string,
  card: CardPricePayload,
  refData: CardReferenceData
): Promise<number | null> {
  try {
    // Build a base card query (same card without parallel)
    const query = [card.year, refData.confirmedSetProduct, card.playerName].filter(Boolean).join(" ");
    log("multiplier-fallback", `Searching base card comps: "${query}"`);

    const result = await scrape130Point(query);
    if (!result.success || result.listings.length === 0) return null;

    // Filter to likely base cards (no numbered parallel indicators)
    const baseListings = result.listings.filter((l) => {
      const title = l.title.toLowerCase();
      const hasNumbered = /\/\s*\d{1,4}\b/.test(title);
      const hasColorParallel = ["gold", "red", "blue", "green", "purple", "black", "orange", "pink", "platinum", "sapphire"]
        .some((c) => new RegExp(`\\b${c}\\b`, "i").test(title));
      return !hasNumbered && !hasColorParallel;
    });

    if (baseListings.length === 0) return null;

    const prices = baseListings.slice(0, 10).map((l) => l.price).sort((a, b) => a - b);
    const median = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

    return Math.round(median * 100) / 100;
  } catch (err) {
    logError("multiplier-fallback", "Failed to get base card estimate", err);
    return null;
  }
}

// ══════════════════════════════════════════
// LAYER 1: Structural Hard-Kill + Keyword Pre-Filter
// ══════════════════════════════════════════

/**
 * Two-pass pre-filter:
 *
 * PASS A — Structural Hard-Kills (instant, zero tolerance):
 *   These are binary rules that immediately reject a listing regardless of score.
 *   No amount of keyword matches can overcome these:
 *   - Player name not present at all → KILL
 *   - Year mismatch (listing has a DIFFERENT year) → KILL
 *   - Known novelty/parody sets (Texas Taters, Garbage Pail Kids, etc.) → KILL
 *   - Lot/bundle detected → KILL
 *   - Graded vs raw mismatch when card is NOT graded → KILL
 *   - Autograph mismatch (listing has auto, card doesn't, or vice versa) → KILL
 *
 * PASS B — Keyword scoring for surviving listings:
 *   Score the remaining listings and filter by threshold.
 */

// Known novelty, parody, and custom sets that should NEVER match real cards
const NOVELTY_SETS = [
  "texas taters", "garbage pail", "wacky packages", "mars attacks",
  "allen & ginter mini", "topps project", "project 2020", "project70",
  "topps now", "topps living", "topps x", "topps rip", "custom",
  "reprint", "replica", "facsimile", "tribute card", "art card",
  "sketch card", "printing plate",
];

const LOT_INDICATORS = [
  "lot ", " lot", "bundle", " x2 ", " x3 ", " x4 ", " x5 ",
  "lot of", "card lot", "team lot", "you pick", "pick your",
  "base set", "complete set", "full set",
];

const GRADED_INDICATORS = [
  "psa ", "bgs ", "sgc ", "cgc ", " psa", " bgs", " sgc", " cgc",
  "psa10", "psa9", "psa8", "bgs9", "bgs10",
];

const AUTO_INDICATORS = [
  "auto ", " auto", "autograph", "auto/", "/auto",
  "on-card auto", "on card auto", "signed",
];

const PRE_FILTER_THRESHOLD = 55;

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
  const setWords = setName.split(/\s+/).filter((w) =>
    w.length > 2 && !["the", "and", "topps", "baseball", "panini"].includes(w)
  );

  const cardParallel = (card.parallelVariant || "").toLowerCase();
  const isBaseCard = !cardParallel || cardParallel === "base" || cardParallel === "base card";

  // Extract the color/type word from the parallel (e.g., "gold" from "Gold Parallel")
  const parallelKeywords = cardParallel
    .replace(/parallel|variant|refractor/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  return listings.map((listing) => {
    const titleLower = listing.title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // ════════════════════════════════════
    // PASS A: Structural Hard-Kills
    // ════════════════════════════════════

    // HARD-KILL 1: Player name must be present
    const hasLastName = titleLower.includes(playerLastName);
    if (!hasLastName) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: player name not in title" };
    }

    // HARD-KILL 2: Year mismatch — reject if listing year is >1 year away
    // Allow ±1 year as "close" (e.g., 2025 card can match 2026 listings) since
    // sets sometimes span years and sellers list by release vs copyright year.
    // Exact year mismatch >1 year is a hard kill.
    let yearPenalty = 0;
    if (year) {
      const yearNum = parseInt(year);
      const yearRegex = /\b(19|20)\d{2}\b/g;
      const yearsInTitle = [...titleLower.matchAll(yearRegex)].map(m => parseInt(m[0]));
      if (yearsInTitle.length > 0) {
        const closestYear = yearsInTitle.reduce((best, y) =>
          Math.abs(y - yearNum) < Math.abs(best - yearNum) ? y : best, yearsInTitle[0]);
        const yearDiff = Math.abs(closestYear - yearNum);
        if (yearDiff > 1) {
          return { ...listing, matchScore: 0, excluded: true, excludeReason: `HARD-KILL: year mismatch >1yr (card: ${year}, listing: ${yearsInTitle.join(",")})` };
        }
        if (yearDiff === 1) {
          yearPenalty = -10; // Adjacent year — penalize but don't kill
        }
      }
    }

    // HARD-KILL 3: Novelty/parody set detection
    const isNovelty = NOVELTY_SETS.some((n) => titleLower.includes(n));
    if (isNovelty) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: novelty/parody set" };
    }

    // HARD-KILL 4: Lot/bundle detection
    const isLot = LOT_INDICATORS.some((ind) => titleLower.includes(ind));
    if (isLot) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: lot/bundle" };
    }

    // HARD-KILL 5: Graded vs raw mismatch
    const isGradedListing = GRADED_INDICATORS.some((g) => titleLower.includes(g));
    if (!card.graded && isGradedListing) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: graded listing but card is raw" };
    }
    if (card.graded && !isGradedListing) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: raw listing but card is graded" };
    }

    // HARD-KILL 6: Autograph mismatch
    const listingHasAuto = AUTO_INDICATORS.some((a) => titleLower.includes(a));
    if (card.isAutograph && !listingHasAuto) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: card is auto but listing isn't" };
    }
    if (!card.isAutograph && listingHasAuto) {
      return { ...listing, matchScore: 0, excluded: true, excludeReason: "HARD-KILL: listing is auto but card isn't" };
    }

    // ════════════════════════════════════
    // PASS B: Two-Phase Scoring (survivors only)
    //   Phase 1: Compute raw score (0-85 max) from keyword matches
    //   Phase 2: Apply multiplicative parallel factor
    // ════════════════════════════════════

    let rawScore = 0;

    // Player full name
    const hasFirstName = playerFirstName.length > 2 && titleLower.includes(playerFirstName);
    if (hasLastName && hasFirstName) rawScore += 25;
    else rawScore += 10; // last name only (already confirmed present by hard-kill)

    // Year (exact match bonus, ±1 year penalty applied from above)
    if (year && titleLower.includes(year)) rawScore += 15;
    rawScore += yearPenalty; // -10 if ±1 year, 0 otherwise

    // Card number
    if (cardNumberVariants.length > 0 && cardNumberVariants.some((v) => titleLower.includes(v))) {
      rawScore += 15;
    }

    // Set keywords (important for distinguishing Series 1 vs Chrome vs Heritage)
    if (setWords.length > 0) {
      const setMatches = setWords.filter((w) => titleLower.includes(w)).length;
      const setScore = Math.round(15 * (setMatches / setWords.length));
      rawScore += setScore;
    }

    // Best offer — heavy penalty (unreliable prices)
    const isBestOffer = titleLower.includes("best offer") ||
      listing.title.includes("Best Offer") ||
      listing.saleType === "best_offer";
    if (isBestOffer) rawScore -= 30;

    // Clamp raw score before parallel multiplier
    rawScore = Math.max(0, Math.min(85, rawScore));

    // ── Phase 2: Multiplicative parallel factor ──
    // This is the core fix: additive penalties can't push wrong parallels below
    // threshold when the raw score is high. Multiplication ensures wrong parallels
    // land well below threshold regardless of how well other keywords match.
    const numberedRegex = /\/\s*(\d{1,4})\b/;
    const numberedMatch = titleLower.match(numberedRegex);
    const listingNumberedTo = numberedMatch ? parseInt(numberedMatch[1]) : 0;
    const colorParallels = ["gold", "red", "blue", "green", "purple", "black", "orange",
      "pink", "platinum", "sapphire", "magenta", "silver", "refractor", "prizm",
      "chrome", "shimmer", "wave", "aqua", "lava", "ice", "foil", "holo"];
    const listingHasColorParallel = colorParallels.some(c => {
      const regex = new RegExp(`\\b${c}\\b(?!\\s+(sox|wings|bulls|storm))`, "i");
      return regex.test(listing.title);
    });

    let parallelMultiplier = 1.0;
    let parallelBonus = 0;

    if (!isBaseCard && parallelKeywords.length > 0) {
      // Card IS a specific parallel — check if listing matches
      const parallelMatches = parallelKeywords.filter((w) => titleLower.includes(w)).length;
      if (parallelMatches > 0) {
        parallelMultiplier = 1.0;
        parallelBonus = 15; // Exact parallel match bonus
      } else {
        // Listing doesn't mention our parallel — probably a different parallel or base
        parallelMultiplier = 0.35;
      }
    } else if (isBaseCard) {
      // Card IS base — penalize if listing is a numbered/color parallel
      if (listingNumberedTo > 0 && listingNumberedTo <= 25) {
        parallelMultiplier = 0.15; // /1 - /25 = ultra-rare, way off from base
      } else if (listingNumberedTo > 25 && listingNumberedTo <= 99) {
        parallelMultiplier = 0.25; // /26 - /99
      } else if (listingNumberedTo > 99 && listingNumberedTo <= 199) {
        parallelMultiplier = 0.4; // /100 - /199
      } else if (listingHasColorParallel && listingNumberedTo === 0) {
        parallelMultiplier = 0.5; // Unnumbered color parallel
      } else {
        // Listing appears to be base too — reward
        parallelMultiplier = 1.0;
        parallelBonus = 15;
      }
    }

    // Final score = (raw × multiplier) + bonus
    let score = Math.round(rawScore * parallelMultiplier) + parallelBonus;
    score = Math.max(0, Math.min(100, score));

    const excluded = score < PRE_FILTER_THRESHOLD;
    if (excluded) {
      log("pre-filter", `EXCLUDED (${score}): "${listing.title.substring(0, 70)}..."`);
    }
    return {
      ...listing,
      matchScore: score,
      excluded,
      excludeReason: excluded ? `pre-filter score ${score} < ${PRE_FILTER_THRESHOLD}` : undefined,
    };
  });
}

// ══════════════════════════════════════════
// LAYER 2: Gemini Comp Validation
// ══════════════════════════════════════════

/**
 * Send a batch of listing titles to Gemini and ask it to classify each as:
 *   - "exact":  This is the same card (same player, set, year, parallel, condition type)
 *   - "close":  Same card but slightly different condition/parallel — useful as reference
 *   - "wrong":  Different card entirely (wrong set, wrong player, novelty card, etc.)
 *
 * This is the KEY intelligence layer. The keyword scorer can't understand that
 * "Texas Taters" is a novelty/parody set, not the same as "Topps Series 1".
 * Gemini can.
 */
async function validateCompsWithGemini(
  card: CardPricePayload,
  listings: SoldListing[]
): Promise<SoldListing[]> {
  try {
    const ai = getGemini();

    const cardDesc = [
      `Player: ${card.playerName}`,
      `Year: ${card.year || "unknown"}`,
      `Set: ${card.setName || "unknown"}`,
      `Manufacturer: ${card.manufacturer || "unknown"}`,
      card.cardNumber ? `Card #: ${card.cardNumber}` : null,
      `Parallel: ${card.parallelVariant || "base (no parallel)"}`,
      card.isAutograph ? "Autograph: YES" : "Autograph: NO",
      card.subsetOrInsert ? `Insert/Subset: ${card.subsetOrInsert}` : null,
      card.graded ? `Graded: ${card.gradingCompany} ${card.grade}` : "Graded: NO (raw)",
    ].filter(Boolean).join("\n");

    const listingLines = listings.slice(0, 30).map((l, i) =>
      `${i + 1}. "$${l.price} — ${l.title}" [${l.source}, ${l.date || "no date"}${l.saleType === "best_offer" ? ", BEST OFFER" : ""}]`
    ).join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a baseball card identification expert. I need you to validate whether each listing below is actually the SAME card as mine, or a different card entirely.

MY CARD:
${cardDesc}

LISTINGS TO VALIDATE:
${listingLines}

For EACH listing, classify it as:
- "exact": Same player, same set/product line, same year, same parallel type (or both base), same condition category (graded/raw). This IS my card.
- "close": Same player and similar card, but different parallel, different year, or different condition type. Could be used as a reference comp.
- "wrong": Different card entirely — wrong player, wrong set (e.g., novelty/parody sets like "Texas Taters"), wrong sport, lot/bundle, or fundamentally not the same product.

IMPORTANT RULES:
1. A "Topps Series 1" base card is NOT the same as a "Texas Taters" card, even if same player
2. Different numbered parallels are "close" not "exact" (e.g., /50 vs base, or /25 vs /99)
3. Graded cards (PSA, BGS, SGC) are "close" not "exact" when my card is raw, and vice versa
4. Different years are "close" not "exact"
5. Autograph vs non-autograph = "wrong" (huge value difference)
6. Different inserts/subsets within the same product = "close" not "exact"
7. Lots and bundles = "wrong"
8. Best Offer listings where price is unreliable = mark as "close" at best
9. 'SP' or 'SSP' in the listing title = short print variation (different photo). This is WRONG if my card is the base version, and WRONG if my card is base but listing says SP/SSP. Only "exact" if my card is also an SP/SSP.
10. 'Variation' or 'VAR' in the listing often means an image variation, not a parallel. Treat as "close" unless confirmed exact match to my card.
11. Damaged, creased, or poor condition cards should be "close" even if same card, as their price is non-representative of fair market value.
12. Case break or group break entries (not actual completed card sales) = "wrong". Look for keywords like "case break", "group break", "break spot", "random team".

Return a JSON array with one object per listing:
[{"index": 1, "verdict": "exact|close|wrong", "reason": "brief reason"}]

Return ONLY the JSON array, no other text.`,
        }],
      }],
      config: { temperature: 0.1, maxOutputTokens: 2048 },
    });

    const rawText = response.text ?? "";

    // Strip markdown code fences if present
    const text = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    // Try multiple extraction strategies
    let verdicts: Array<{ index: number; verdict: string; reason: string }> = [];
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        verdicts = JSON.parse(arrayMatch[0]);
      } catch (parseErr) {
        log("gemini-validate", `JSON parse failed on extracted array: ${String(parseErr).substring(0, 100)}`);
      }
    }

    // Fallback: try parsing the whole text as JSON
    if (verdicts.length === 0) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) verdicts = parsed;
      } catch {
        // Last resort: try to extract individual verdict objects
        const objMatches = [...text.matchAll(/\{\s*"index"\s*:\s*(\d+)\s*,\s*"verdict"\s*:\s*"(\w+)"\s*,\s*"reason"\s*:\s*"([^"]*?)"\s*\}/g)];
        if (objMatches.length > 0) {
          verdicts = objMatches.map(m => ({
            index: parseInt(m[1]),
            verdict: m[2],
            reason: m[3],
          }));
        }
      }
    }

    if (verdicts.length === 0) {
      log("gemini-validate", `Failed to parse validation response — raw text: "${rawText.substring(0, 200)}..."`);
      // When Gemini fails, DON'T keep all listings — only keep those with high keyword scores
      return listings.map(l => ({
        ...l,
        excluded: (l.matchScore ?? 0) < 65,
        excludeReason: (l.matchScore ?? 0) < 65 ? "Gemini validation failed, keyword score too low" : undefined,
      }));
    }

    log("gemini-validate", `Parsed ${verdicts.length} verdicts from Gemini`);

    // Apply verdicts to listings
    return listings.map((listing, i) => {
      const verdict = verdicts.find((v) => v.index === i + 1);
      if (!verdict) return listing;

      const aiVerdict = verdict.verdict as "exact" | "close" | "wrong";
      const excluded = aiVerdict === "wrong";

      // Boost match score for exact matches, reduce for close
      let adjustedScore = listing.matchScore ?? 50;
      if (aiVerdict === "exact") adjustedScore = Math.max(adjustedScore, 85);
      else if (aiVerdict === "close") adjustedScore = Math.min(adjustedScore, 65);
      else adjustedScore = 0;

      if (excluded) {
        log("gemini-validate", `REJECTED: "${listing.title.substring(0, 60)}..." — ${verdict.reason}`);
      }

      return {
        ...listing,
        matchScore: adjustedScore,
        aiVerdict,
        aiReason: verdict.reason,
        excluded,
        excludeReason: excluded ? `Gemini: ${verdict.reason}` : undefined,
      };
    });
  } catch (err) {
    logError("gemini-validate", "Gemini validation failed — keeping pre-filtered results", err);
    return listings;
  }
}

// ══════════════════════════════════════════
// LAYER 3: Comparable Player Search
// ══════════════════════════════════════════

/**
 * When we can't find enough exact comps for a card, find comparable players
 * and search for their cards with the EXACT same set, year, and parallel.
 *
 * Strategy (Sprint 3 - player_canonical integration):
 * 1. First: try deterministic tier matching via player_canonical.market_tier
 *    - Resolve player → canonical entry (exact name or alias)
 *    - If found with tier: query same-tier peers → use directly
 *    - This eliminates ~80% of Gemini calls and produces consistent results
 * 2. Fallback: ask Gemini to suggest comparable players (only when unknown)
 *
 * Example: Gunnar Henderson 2026 Topps Series 1 Purple /250
 *   → market_tier = "star" → peers: Bobby Witt Jr, Julio Rodriguez, Corbin Carroll
 *   → Search: "2026 Topps Series 1 Bobby Witt Jr Purple /250"
 */
async function findComparablePlayerComps(
  card: CardPricePayload,
  usdToCad: number
): Promise<SoldListing[]> {
  try {
    let peerNames: string[] = [];

    // ── Step 1: Try deterministic tier matching via player_canonical ──
    if (card.playerName) {
      try {
        const [canonical] = await db
          .select({
            id: playerCanonical.id,
            marketTier: playerCanonical.marketTier,
            sport: playerCanonical.sport,
          })
          .from(playerCanonical)
          .where(
            or(
              eq(playerCanonical.canonicalName, card.playerName),
              sql`${card.playerName} = ANY(${playerCanonical.aliases})`
            )
          )
          .limit(1);

        if (canonical?.marketTier) {
          // Found player with tier — query same-tier peers
          const peers = await db
            .select({ canonicalName: playerCanonical.canonicalName })
            .from(playerCanonical)
            .where(
              and(
                eq(playerCanonical.marketTier, canonical.marketTier),
                eq(playerCanonical.sport, canonical.sport ?? "baseball"),
                ne(playerCanonical.id, canonical.id)
              )
            )
            .limit(5);

          if (peers.length >= 3) {
            peerNames = peers.map((p) => p.canonicalName);
            log("comparable-players", `Tier-based peers (${canonical.marketTier}): ${peerNames.join(", ")}`, { card: card.playerName });
          }
        }
      } catch (err) {
        // Tier lookup failed — fall through to Gemini
        logError("comparable-players", "Tier lookup failed, falling back to Gemini", err);
      }
    }

    // ── Step 2: Fallback to Gemini if no tier peers found ──
    if (peerNames.length < 3) {
      const ai = getGemini();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [{
            text: `You are a baseball card market expert. I need comparable players for pricing a card.

CARD: ${card.playerName} — ${card.year} ${card.setName || ""} ${card.parallelVariant || "base"}

Suggest 3-4 players who are at a SIMILAR market value tier as ${card.playerName}. Consider:
- Similar position and career stage
- Similar prospect/star status
- Would trade for roughly the same value in the same set/parallel

Return ONLY a JSON array of player names:
["Bobby Witt Jr", "Julio Rodriguez", "Corbin Carroll"]

No other text.`,
          }],
        }],
        config: { temperature: 0.3, maxOutputTokens: 256 },
      });

      const text = response.text ?? "";
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        peerNames = JSON.parse(match[0]);
        log("comparable-players", `Gemini suggests: ${peerNames.join(", ")}`, { card: card.playerName });
      }
    }

    if (peerNames.length === 0) return [];

    // ── Step 3: Search for each comparable player ──
    const comparableComps: SoldListing[] = [];

    for (const player of peerNames.slice(0, 3)) {
      const query = [
        card.year,
        card.setName || card.manufacturer,
        player,
        card.parallelVariant && !["base", "base card"].includes(card.parallelVariant.toLowerCase())
          ? card.parallelVariant
          : "",
      ].filter(Boolean).join(" ");

      log("comparable-players", `Searching: "${query}"`);
      const result = await scrape130Point(query);

      if (result.success && result.listings.length > 0) {
        for (const listing of result.listings.slice(0, 5)) {
          comparableComps.push({
            title: `[Comp: ${player}] ${listing.title}`,
            price: listing.price,
            date: listing.date,
            source: "comparable",
            url: listing.url,
            searchUrl: result.url,
            saleType: listing.saleType,
            matchScore: 60,
            aiVerdict: "close",
            aiReason: `Comparable player: ${player}`,
          });
        }
      }
    }

    return comparableComps.slice(0, 6);
  } catch (err) {
    logError("comparable-players", "Failed to find comparable players", err);
    return [];
  }
}

// ══════════════════════════════════════════
// LAYER 4: Gemini Price Analysis
// ══════════════════════════════════════════

async function analyzeWithGemini(
  card: CardPricePayload,
  listings: SoldListing[],
  stats: { count: number; avg: number; median: number; low: number; high: number },
  bracketContext?: string
): Promise<{ low: number; mid: number; high: number; notes: string | null } | null> {
  try {
    const ai = getGemini();

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

    // Separate exact vs close comps in the listing summary
    const exactComps = listings.filter(l => l.aiVerdict === "exact" && !l.excluded);
    const closeComps = listings.filter(l => l.aiVerdict === "close" && !l.excluded);
    const comparableComps = listings.filter(l => l.source === "comparable");

    const formatListings = (items: SoldListing[], label: string) => {
      if (items.length === 0) return "";
      return `\n${label}:\n` + items.map((l, i) =>
        `  ${i + 1}. $${l.price} — "${l.title}" [${l.source}, ${l.date || "no date"}]`
      ).join("\n");
    };

    const listingSummary = [
      formatListings(exactComps, "EXACT MATCHES (same card)"),
      formatListings(closeComps, "CLOSE MATCHES (similar card, use as reference only)"),
      formatListings(comparableComps, "COMPARABLE PLAYER COMPS (different player, same set/parallel — use as loose reference)"),
    ].filter(Boolean).join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are a baseball card market analyst. Analyze these validated comparable sales and estimate fair market value.

MY EXACT CARD: ${cardDesc}

${listingSummary}

STATS (from exact matches only): Avg $${stats.avg} | Median $${stats.median} | Low $${stats.low} | High $${stats.high}
${bracketContext || ""}

PRICING RULES:
1. EXACT MATCHES are the primary basis for your estimate
2. CLOSE MATCHES are secondary reference only — discount their weight significantly
3. COMPARABLE PLAYER COMPS show what a similar-tier player's version of this card sells for — use as a sanity check only
4. RECENCY WEIGHTING: Sales within last 30 days get 2x weight vs sales 60-90 days old. More recent sales reflect current market value better.
5. OUTLIER HANDLING: If the highest price is >3x the median, exclude it as an outlier. If the lowest price is <0.3x the median, exclude it (likely damaged or mis-listing).
6. THIN MARKET PROTOCOL: If fewer than 3 exact matches are available, widen the low-high range by 25% in each direction and note "limited data" in your reasoning.
7. If you only have close/comparable matches, note this is a rough estimate
8. If PARALLEL BRACKET DATA is provided, use it as a sanity check — the estimated price should fall within or near the bracket bounds

Return JSON only:
{"low": 0, "mid": 0, "high": 0, "notes": "brief explanation of your reasoning, data quality, and any caveats"}

The "mid" should be what a buyer would reasonably pay today for this exact card.
The "notes" field should explain: how many exact matches you relied on, any outliers excluded, whether data is thin, and recency of sales.`,
        }],
      }],
      config: { temperature: 0.2, maxOutputTokens: 512 },
    });

    const text = response.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      low: parsed.low,
      mid: parsed.mid,
      high: parsed.high,
      notes: parsed.notes || null,
    };
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
