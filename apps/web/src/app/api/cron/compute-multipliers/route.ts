import { NextRequest, NextResponse } from "next/server";
import { db, setProducts, priceHistory, parallelMarketData, parallelTypes, playerCanonical, priceEstimates, cards, referenceCards } from "@holdsworth/db";
import { eq, and, gt, sql, ne, or, isNotNull } from "drizzle-orm";

/**
 * POST /api/cron/compute-multipliers
 *
 * Daily cron job that:
 * 1. Recomputes parallel price multipliers from actual market data
 * 2. Auto-classifies player market tiers from pricing data
 *
 * Uses 90-day window with 30-day preference. Confidence tiers:
 * - Gold: 10+ sales in last 30 days
 * - Silver: 5-9 sales in last 60 days
 * - Bronze: 3-4 sales in last 90 days
 * - Seed: <3 sales, falls back to parallelTypes.priceMultiplier
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = {
      setsProcessed: 0,
      multipliersUpdated: 0,
      playerTiersUpdated: 0,
      errors: [] as string[],
    };

    // ── Phase 1: Compute Parallel Multipliers ──
    // Find set products that have priceHistory with setProductId populated
    const activeSets = await db
      .selectDistinct({ setProductId: priceHistory.setProductId })
      .from(priceHistory)
      .where(
        and(
          isNotNull(priceHistory.setProductId),
          gt(priceHistory.createdAt, sql`NOW() - INTERVAL '90 days'`)
        )
      );

    for (const { setProductId } of activeSets) {
      if (!setProductId) continue;
      try {
        const updated = await computeMultipliersForSet(setProductId);
        results.multipliersUpdated += updated;
        results.setsProcessed++;
      } catch (err) {
        results.errors.push(`Set ${setProductId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Phase 2: Auto-Classify Player Market Tiers ──
    try {
      results.playerTiersUpdated = await computePlayerTiers();
    } catch (err) {
      results.errors.push(`Player tiers: ${err instanceof Error ? err.message : String(err)}`);
    }

    return NextResponse.json({
      ok: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Compute multipliers for a single set product using FK-based aggregation.
 * Returns count of multipliers updated.
 */
async function computeMultipliersForSet(setProductId: string): Promise<number> {
  const ninetyDaysAgo = sql`NOW() - INTERVAL '90 days'`;
  const thirtyDaysAgo = sql`NOW() - INTERVAL '30 days'`;

  // Get all parallel types for this set
  const setParallels = await db
    .select({ id: parallelTypes.id, name: parallelTypes.name, printRun: parallelTypes.printRun })
    .from(parallelTypes)
    .where(eq(parallelTypes.setProductId, setProductId));

  if (setParallels.length === 0) return 0;

  // Get base card average (comps without parallelTypeId = base cards)
  const [baseStats] = await db
    .select({
      avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.setProductId, setProductId),
        sql`${priceHistory.parallelTypeId} IS NULL`,
        gt(priceHistory.createdAt, ninetyDaysAgo),
        isNotNull(priceHistory.priceUsd)
      )
    );

  const baseAvg = baseStats?.avgPrice ? parseFloat(baseStats.avgPrice) : null;
  if (!baseAvg || baseAvg <= 0) return 0;

  let updated = 0;

  for (const parallel of setParallels) {
    // Get pricing stats for this parallel type within 90-day window
    const [stats] = await db
      .select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
        minPrice: sql<string>`MIN(${priceHistory.priceUsd}::numeric)`,
        maxPrice: sql<string>`MAX(${priceHistory.priceUsd}::numeric)`,
        medianPrice: sql<string>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${priceHistory.priceUsd}::numeric)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.parallelTypeId, parallel.id),
          gt(priceHistory.createdAt, ninetyDaysAgo),
          isNotNull(priceHistory.priceUsd)
        )
      );

    if (!stats || stats.count < 3) continue; // Below Bronze threshold

    const avgPrice = parseFloat(stats.avgPrice);
    const multiplier = avgPrice / baseAvg;

    // Check for recent 30-day data (Gold tier preference)
    const [recentStats] = await db
      .select({
        avgPrice: sql<string>`AVG(${priceHistory.priceUsd}::numeric)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.parallelTypeId, parallel.id),
          gt(priceHistory.createdAt, thirtyDaysAgo),
          isNotNull(priceHistory.priceUsd)
        )
      );

    // Use 30-day average if 3+ recent samples, otherwise use 90-day
    const effectiveAvg = (recentStats && recentStats.count >= 3)
      ? parseFloat(recentStats.avgPrice)
      : avgPrice;
    const effectiveMultiplier = effectiveAvg / baseAvg;

    // Determine confidence tier
    let confidenceTier: string;
    if (recentStats && recentStats.count >= 10) confidenceTier = "gold";
    else if (stats.count >= 5) confidenceTier = "silver";
    else confidenceTier = "bronze";

    // Upsert to parallelMarketData
    await db
      .insert(parallelMarketData)
      .values({
        parallelTypeId: parallel.id,
        setProductId,
        computedMultiplier: String(Math.round(effectiveMultiplier * 1000) / 1000),
        avgPriceUsd: String(Math.round(effectiveAvg * 100) / 100),
        basePriceUsd: String(Math.round(baseAvg * 100) / 100),
        sampleSize: stats.count,
        priceRange: {
          min: parseFloat(stats.minPrice),
          max: parseFloat(stats.maxPrice),
          median: parseFloat(stats.medianPrice),
          confidenceTier,
          recentSamples: recentStats?.count ?? 0,
        },
        lastComputedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [parallelMarketData.parallelTypeId, parallelMarketData.setProductId],
        set: {
          computedMultiplier: String(Math.round(effectiveMultiplier * 1000) / 1000),
          avgPriceUsd: String(Math.round(effectiveAvg * 100) / 100),
          basePriceUsd: String(Math.round(baseAvg * 100) / 100),
          sampleSize: stats.count,
          priceRange: {
            min: parseFloat(stats.minPrice),
            max: parseFloat(stats.maxPrice),
            median: parseFloat(stats.medianPrice),
            confidenceTier,
            recentSamples: recentStats?.count ?? 0,
          },
          lastComputedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    updated++;
  }

  return updated;
}

/**
 * Auto-classify player market tiers based on base card pricing data.
 * Returns count of players updated.
 */
async function computePlayerTiers(): Promise<number> {
  // Get players with base card pricing data
  const playerPrices = await db
    .select({
      canonicalId: playerCanonical.id,
      canonicalName: playerCanonical.canonicalName,
      medianValue: sql<string>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${priceEstimates.estimatedValueUsd}::numeric)`,
      cardCount: sql<number>`COUNT(*)`,
    })
    .from(playerCanonical)
    .innerJoin(referenceCards, eq(referenceCards.playerName, playerCanonical.canonicalName))
    .innerJoin(cards, eq(cards.referenceCardId, referenceCards.id))
    .innerJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(
      and(
        isNotNull(priceEstimates.estimatedValueUsd),
        or(
          sql`${cards.parallelVariant} IS NULL`,
          sql`LOWER(${cards.parallelVariant}) IN ('base', 'base card', '')`
        )
      )
    )
    .groupBy(playerCanonical.id, playerCanonical.canonicalName)
    .having(sql`COUNT(*) >= 2`);

  let updated = 0;
  for (const pp of playerPrices) {
    const median = parseFloat(pp.medianValue);
    let tier: string;
    if (median >= 20) tier = "elite";
    else if (median >= 5) tier = "star";
    else if (median >= 1.5) tier = "solid";
    else if (median >= 0.5) tier = "collector";
    else tier = "common";

    await db
      .update(playerCanonical)
      .set({ marketTier: tier })
      .where(eq(playerCanonical.id, pp.canonicalId));

    updated++;
  }

  return updated;
}
