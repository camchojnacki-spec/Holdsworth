"use server";

import {
  db,
  setProducts,
  referenceCards,
  parallelTypes,
  parallelMarketData,
  subsets,
  manufacturers,
  cards,
  priceHistory,
} from "@holdsworth/db";
import { eq, ilike, or, sql, desc, and, isNotNull } from "drizzle-orm";

// ── Stats ──

export async function getReferenceDbStats() {
  const [setCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(setProducts);

  const [cardCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referenceCards);

  const [parallelCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(parallelTypes);

  const [playerCount] = await db
    .select({
      count: sql<number>`count(distinct ${referenceCards.playerName})::int`,
    })
    .from(referenceCards);

  return {
    sets: setCount?.count ?? 0,
    cards: cardCount?.count ?? 0,
    parallels: parallelCount?.count ?? 0,
    players: playerCount?.count ?? 0,
  };
}

// ── Set Products ──

export async function getSetProducts() {
  const rows = await db
    .select({
      id: setProducts.id,
      name: setProducts.name,
      year: setProducts.year,
      sport: setProducts.sport,
      releaseDate: setProducts.releaseDate,
      baseSetSize: setProducts.baseSetSize,
      lastScrapedAt: setProducts.lastScrapedAt,
      manufacturerName: manufacturers.name,
      cardCount: sql<number>`(
        select count(*)::int from reference_cards
        where reference_cards.set_product_id = ${setProducts.id}
      )`,
      parallelCount: sql<number>`(
        select count(*)::int from parallel_types
        where parallel_types.set_product_id = ${setProducts.id}
      )`,
    })
    .from(setProducts)
    .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
    .orderBy(desc(setProducts.year), setProducts.name);

  return rows;
}

// ── Set Details ──

export async function getSetDetails(setProductId: string) {
  // Set product info
  const [product] = await db
    .select({
      id: setProducts.id,
      name: setProducts.name,
      year: setProducts.year,
      sport: setProducts.sport,
      releaseDate: setProducts.releaseDate,
      baseSetSize: setProducts.baseSetSize,
      sourceUrl: setProducts.sourceUrl,
      lastScrapedAt: setProducts.lastScrapedAt,
      manufacturerName: manufacturers.name,
    })
    .from(setProducts)
    .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
    .where(eq(setProducts.id, setProductId))
    .limit(1);

  if (!product) return null;

  // Cards in the set
  const cards = await db
    .select({
      id: referenceCards.id,
      cardNumber: referenceCards.cardNumber,
      playerName: referenceCards.playerName,
      team: referenceCards.team,
      position: referenceCards.position,
      isRookieCard: referenceCards.isRookieCard,
      isAutograph: referenceCards.isAutograph,
      isRelic: referenceCards.isRelic,
      isShortPrint: referenceCards.isShortPrint,
      printRun: referenceCards.printRun,
      notes: referenceCards.notes,
      subsetName: subsets.name,
    })
    .from(referenceCards)
    .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
    .where(eq(referenceCards.setProductId, setProductId))
    .orderBy(referenceCards.cardNumber);

  // Parallel types
  const parallels = await db
    .select({
      id: parallelTypes.id,
      name: parallelTypes.name,
      printRun: parallelTypes.printRun,
      serialNumbered: parallelTypes.serialNumbered,
      colorFamily: parallelTypes.colorFamily,
      finishType: parallelTypes.finishType,
      exclusiveTo: parallelTypes.exclusiveTo,
      priceMultiplier: parallelTypes.priceMultiplier,
      subsetName: subsets.name,
    })
    .from(parallelTypes)
    .leftJoin(subsets, eq(parallelTypes.subsetId, subsets.id))
    .where(eq(parallelTypes.setProductId, setProductId))
    .orderBy(parallelTypes.name);

  // Subsets
  const setSubsets = await db
    .select()
    .from(subsets)
    .where(eq(subsets.setProductId, setProductId))
    .orderBy(subsets.name);

  return { product, cards, parallels, subsets: setSubsets };
}

// ── Search ──

export async function searchReferenceDb(query: string) {
  if (!query || query.trim().length < 2) return [];

  const term = `%${query.trim()}%`;

  const results = await db
    .select({
      id: referenceCards.id,
      cardNumber: referenceCards.cardNumber,
      playerName: referenceCards.playerName,
      team: referenceCards.team,
      position: referenceCards.position,
      isRookieCard: referenceCards.isRookieCard,
      setProductId: referenceCards.setProductId,
      setName: setProducts.name,
      setYear: setProducts.year,
    })
    .from(referenceCards)
    .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
    .where(
      or(
        ilike(referenceCards.playerName, term),
        ilike(referenceCards.cardNumber, term),
        ilike(setProducts.name, term)
      )
    )
    .orderBy(setProducts.year, referenceCards.cardNumber)
    .limit(100);

  return results;
}

// ── Dynamic Parallel Multipliers ──

/**
 * Compute dynamic price multipliers for all parallel types within a set product.
 *
 * Uses FK-based aggregation (parallelTypeId on priceHistory) instead of string matching.
 * 90-day temporal window with 30-day preference when sample size permits.
 *
 * Confidence tiers:
 * - Gold: 10+ sales in last 30 days → use 30-day average
 * - Silver: 5-9 sales in last 60 days → use 60-day average
 * - Bronze: 3-4 sales in last 90 days → use 90-day average
 * - Seed: <3 sales → fall back to parallelTypes.priceMultiplier
 */
export async function computeParallelMultipliers(setProductId: string) {
  // 1. Get all parallel types for this set product
  const setParallels = await db
    .select()
    .from(parallelTypes)
    .where(eq(parallelTypes.setProductId, setProductId));

  if (setParallels.length === 0) {
    return { success: false, error: "No parallel types found for this set" };
  }

  const ninetyDaysAgo = sql`NOW() - INTERVAL '90 days'`;
  const sixtyDaysAgo = sql`NOW() - INTERVAL '60 days'`;
  const thirtyDaysAgo = sql`NOW() - INTERVAL '30 days'`;

  // 2. Get base card average (comps without parallelTypeId = base cards) within 90 days
  //    Try FK-based first, fall back to string matching for legacy data
  const [baseStats] = await db
    .select({
      avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.setProductId, setProductId),
        sql`${priceHistory.parallelTypeId} IS NULL`,
        sql`${priceHistory.createdAt} > ${ninetyDaysAgo}`,
        isNotNull(priceHistory.priceUsd)
      )
    );

  // Fallback: if no FK-linked base data, try string matching via cards join
  let baseAvg = baseStats?.avgPrice ? parseFloat(baseStats.avgPrice) : 0;
  if (baseAvg <= 0) {
    const [legacyBase] = await db
      .select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
      })
      .from(priceHistory)
      .innerJoin(cards, eq(priceHistory.cardId, cards.id))
      .innerJoin(referenceCards, eq(cards.referenceCardId, referenceCards.id))
      .where(
        and(
          eq(referenceCards.setProductId, setProductId),
          sql`(${cards.parallelVariant} IS NULL OR LOWER(${cards.parallelVariant}) IN ('base', 'base card', ''))`,
          isNotNull(priceHistory.priceUsd)
        )
      );
    baseAvg = legacyBase?.avgPrice ? parseFloat(legacyBase.avgPrice) : 0;
  }

  if (baseAvg <= 0) {
    return {
      success: true,
      message: "No base card sales data available to compute multipliers",
      updated: 0,
    };
  }

  // 3. For each parallel type, compute multiplier using FK-based aggregation
  let updated = 0;
  for (const parallel of setParallels) {
    // Query at 90, 60, and 30 day windows
    const windows = await Promise.all([
      // 90-day window
      db.select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
        minPrice: sql<string>`MIN(${priceHistory.priceUsd}::numeric)`,
        maxPrice: sql<string>`MAX(${priceHistory.priceUsd}::numeric)`,
        medianPrice: sql<string>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${priceHistory.priceUsd}::numeric)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(priceHistory).where(
        and(
          eq(priceHistory.parallelTypeId, parallel.id),
          sql`${priceHistory.createdAt} > ${ninetyDaysAgo}`,
          isNotNull(priceHistory.priceUsd)
        )
      ),
      // 60-day window
      db.select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(priceHistory).where(
        and(
          eq(priceHistory.parallelTypeId, parallel.id),
          sql`${priceHistory.createdAt} > ${sixtyDaysAgo}`,
          isNotNull(priceHistory.priceUsd)
        )
      ),
      // 30-day window
      db.select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
        count: sql<number>`COUNT(*)::int`,
      }).from(priceHistory).where(
        and(
          eq(priceHistory.parallelTypeId, parallel.id),
          sql`${priceHistory.createdAt} > ${thirtyDaysAgo}`,
          isNotNull(priceHistory.priceUsd)
        )
      ),
    ]);

    const [stats90] = windows[0];
    const [stats60] = windows[1];
    const [stats30] = windows[2];

    if (!stats90 || stats90.count < 3) continue; // Below Bronze threshold

    // Determine confidence tier and effective average
    let confidenceTier: string;
    let effectiveAvg: number;

    if (stats30 && stats30.count >= 10) {
      confidenceTier = "gold";
      effectiveAvg = parseFloat(stats30.avgPrice);
    } else if (stats60 && stats60.count >= 5) {
      confidenceTier = "silver";
      effectiveAvg = parseFloat(stats60.avgPrice);
    } else {
      confidenceTier = "bronze";
      effectiveAvg = parseFloat(stats90.avgPrice);
    }

    const computedMultiplier = (effectiveAvg / baseAvg).toFixed(3);

    await db
      .insert(parallelMarketData)
      .values({
        parallelTypeId: parallel.id,
        setProductId,
        computedMultiplier,
        avgPriceUsd: effectiveAvg.toFixed(2),
        basePriceUsd: baseAvg.toFixed(2),
        sampleSize: stats90.count,
        lastComputedAt: new Date(),
        priceRange: {
          min: parseFloat(stats90.minPrice),
          max: parseFloat(stats90.maxPrice),
          median: parseFloat(stats90.medianPrice),
          confidenceTier,
          recentSamples30d: stats30?.count ?? 0,
          recentSamples60d: stats60?.count ?? 0,
        },
      })
      .onConflictDoUpdate({
        target: [parallelMarketData.parallelTypeId, parallelMarketData.setProductId],
        set: {
          computedMultiplier,
          avgPriceUsd: effectiveAvg.toFixed(2),
          basePriceUsd: baseAvg.toFixed(2),
          sampleSize: stats90.count,
          lastComputedAt: new Date(),
          priceRange: {
            min: parseFloat(stats90.minPrice),
            max: parseFloat(stats90.maxPrice),
            median: parseFloat(stats90.medianPrice),
            confidenceTier,
            recentSamples30d: stats30?.count ?? 0,
            recentSamples60d: stats60?.count ?? 0,
          },
          updatedAt: new Date(),
        },
      });

    updated++;
  }

  return { success: true, updated, totalParallels: setParallels.length };
}

/**
 * Get the effective price multiplier for a parallel type.
 *
 * Confidence-weighted blending:
 * - Gold/Silver: Use computed multiplier directly
 * - Bronze: Blend 70% computed, 30% seed
 * - Seed: Fall back to parallelTypes.priceMultiplier
 */
export async function getEffectiveMultiplier(parallelTypeId: string) {
  // Check for computed market data first
  const [marketData] = await db
    .select()
    .from(parallelMarketData)
    .where(eq(parallelMarketData.parallelTypeId, parallelTypeId))
    .limit(1);

  // Get seed value as fallback
  const [parallel] = await db
    .select()
    .from(parallelTypes)
    .where(eq(parallelTypes.id, parallelTypeId))
    .limit(1);

  const seedMultiplier = parallel?.priceMultiplier ? parseFloat(parallel.priceMultiplier) : 1.0;

  if (marketData?.computedMultiplier && marketData.sampleSize && marketData.sampleSize >= 3) {
    const computed = parseFloat(marketData.computedMultiplier);
    const priceRange = marketData.priceRange as { confidenceTier?: string } | null;
    const tier = priceRange?.confidenceTier ?? "bronze";

    // Bronze tier: blend with seed for stability
    const effectiveMultiplier = tier === "bronze"
      ? computed * 0.7 + seedMultiplier * 0.3
      : computed;

    return {
      multiplier: Math.round(effectiveMultiplier * 1000) / 1000,
      source: "market_data" as const,
      confidenceTier: tier,
      sampleSize: marketData.sampleSize,
      lastComputedAt: marketData.lastComputedAt,
    };
  }

  return {
    multiplier: seedMultiplier,
    source: "seed_default" as const,
    confidenceTier: "seed",
    sampleSize: 0,
    lastComputedAt: null,
  };
}
