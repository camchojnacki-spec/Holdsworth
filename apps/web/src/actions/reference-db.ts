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
 * Queries price_history for cards in this set, groups by parallel variant,
 * and computes avg price per parallel vs avg base price. Results are upserted
 * into the parallel_market_data table.
 *
 * The system prefers computed multipliers when available, falling back to the
 * hardcoded `parallelTypes.priceMultiplier` seed value.
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

  // 2. Query actual sale prices grouped by parallel variant
  //    Join cards -> priceHistory to get avg prices per parallel variant
  const salesByParallel = await db
    .select({
      parallelVariant: cards.parallelVariant,
      avgPrice: sql<string>`avg(${priceHistory.priceUsd})::numeric(10,2)`,
      minPrice: sql<string>`min(${priceHistory.priceUsd})::numeric(10,2)`,
      maxPrice: sql<string>`max(${priceHistory.priceUsd})::numeric(10,2)`,
      medianPrice: sql<string>`percentile_cont(0.5) within group (order by ${priceHistory.priceUsd})::numeric(10,2)`,
      sampleSize: sql<number>`count(*)::int`,
    })
    .from(priceHistory)
    .innerJoin(cards, eq(priceHistory.cardId, cards.id))
    .innerJoin(referenceCards, eq(cards.referenceCardId, referenceCards.id))
    .where(
      and(
        eq(referenceCards.setProductId, setProductId),
        isNotNull(priceHistory.priceUsd)
      )
    )
    .groupBy(cards.parallelVariant);

  // 3. Find the base card average price (null or empty parallel variant = base)
  const baseEntry = salesByParallel.find(
    (s) => !s.parallelVariant || s.parallelVariant.toLowerCase() === "base"
  );
  const baseAvg = baseEntry ? parseFloat(baseEntry.avgPrice || "0") : 0;

  if (baseAvg <= 0) {
    return {
      success: true,
      message: "No base card sales data available to compute multipliers",
      updated: 0,
    };
  }

  // 4. For each parallel type, match against sales data and upsert market data
  let updated = 0;
  for (const parallel of setParallels) {
    // Match by comparing parallel type name against card parallel variant
    const matchedSales = salesByParallel.find((s) => {
      if (!s.parallelVariant) return false;
      const variant = s.parallelVariant.toLowerCase();
      const name = parallel.name.toLowerCase();
      // Match if variant contains the parallel name or vice versa
      return variant.includes(name) || name.includes(variant);
    });

    if (!matchedSales || matchedSales.sampleSize < 1) continue;

    const avgPrice = parseFloat(matchedSales.avgPrice || "0");
    const computedMultiplier = (avgPrice / baseAvg).toFixed(3);

    await db
      .insert(parallelMarketData)
      .values({
        parallelTypeId: parallel.id,
        setProductId,
        computedMultiplier,
        avgPriceUsd: matchedSales.avgPrice,
        basePriceUsd: baseAvg.toFixed(2),
        sampleSize: matchedSales.sampleSize,
        lastComputedAt: new Date(),
        priceRange: {
          min: matchedSales.minPrice,
          max: matchedSales.maxPrice,
          median: matchedSales.medianPrice,
        },
      })
      .onConflictDoUpdate({
        target: [parallelMarketData.parallelTypeId, parallelMarketData.setProductId],
        set: {
          computedMultiplier,
          avgPriceUsd: matchedSales.avgPrice,
          basePriceUsd: baseAvg.toFixed(2),
          sampleSize: matchedSales.sampleSize,
          lastComputedAt: new Date(),
          priceRange: {
            min: matchedSales.minPrice,
            max: matchedSales.maxPrice,
            median: matchedSales.medianPrice,
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
 * Prefers the dynamic computed multiplier from market data,
 * falling back to the hardcoded seed value on parallel_types.
 */
export async function getEffectiveMultiplier(parallelTypeId: string) {
  // Check for computed market data first
  const [marketData] = await db
    .select()
    .from(parallelMarketData)
    .where(eq(parallelMarketData.parallelTypeId, parallelTypeId))
    .limit(1);

  if (marketData?.computedMultiplier && marketData.sampleSize && marketData.sampleSize >= 3) {
    return {
      multiplier: parseFloat(marketData.computedMultiplier),
      source: "market_data" as const,
      sampleSize: marketData.sampleSize,
      lastComputedAt: marketData.lastComputedAt,
    };
  }

  // Fall back to hardcoded seed value
  const [parallel] = await db
    .select()
    .from(parallelTypes)
    .where(eq(parallelTypes.id, parallelTypeId))
    .limit(1);

  return {
    multiplier: parallel?.priceMultiplier ? parseFloat(parallel.priceMultiplier) : 1.0,
    source: "seed_default" as const,
    sampleSize: 0,
    lastComputedAt: null,
  };
}
