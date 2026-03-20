"use server";

import { db, cards, priceEstimates, portfolioSnapshots } from "@holdsworth/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";

/**
 * B-007: Portfolio time-series — daily value snapshots.
 */

export interface SnapshotData {
  date: string;
  totalValueUsd: number;
  totalValueCad: number;
  totalCostCad: number;
  cardCount: number;
  pricedCount: number;
}

/**
 * Take a snapshot of today's portfolio value.
 * Called on page load (deduped to once per day) or manually.
 */
export async function takePortfolioSnapshot(): Promise<void> {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Check if we already have a snapshot for today
  const [existing] = await db
    .select({ id: portfolioSnapshots.id })
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.snapshotDate, today))
    .limit(1);

  // Calculate current portfolio values
  const [valueResult] = await db
    .select({
      totalUsd: sql<string>`coalesce(sum(${priceEstimates.estimatedValueUsd}::numeric), 0)`,
      totalCad: sql<string>`coalesce(sum(${priceEstimates.estimatedValueCad}::numeric), 0)`,
      pricedCount: sql<number>`count(*)::int`,
    })
    .from(priceEstimates)
    .innerJoin(cards, and(eq(priceEstimates.cardId, cards.id), sql`${cards.status} != 'sold'`));

  const [cardResult] = await db
    .select({
      total: sql<number>`count(*)::int`,
      totalCostCad: sql<string>`coalesce(sum(
        case
          when ${cards.purchaseCurrency} = 'CAD' then ${cards.purchasePrice}::numeric
          when ${cards.purchaseCurrency} = 'USD' then ${cards.purchasePrice}::numeric * 1.38
          else ${cards.purchasePrice}::numeric
        end
      ), 0)`,
    })
    .from(cards);

  const values = {
    snapshotDate: today,
    totalValueUsd: valueResult?.totalUsd ?? "0",
    totalValueCad: valueResult?.totalCad ?? "0",
    totalCostCad: cardResult?.totalCostCad ?? "0",
    cardCount: cardResult?.total ?? 0,
    pricedCount: valueResult?.pricedCount ?? 0,
  };

  if (existing) {
    // Update today's snapshot (values may have changed)
    await db
      .update(portfolioSnapshots)
      .set(values)
      .where(eq(portfolioSnapshots.id, existing.id));
  } else {
    await db.insert(portfolioSnapshots).values(values);
  }
}

/**
 * Get portfolio snapshots for the chart.
 * Returns up to `days` days of history.
 */
export async function getPortfolioHistory(days = 90): Promise<SnapshotData[]> {
  // First, take today's snapshot to ensure data is current
  await takePortfolioSnapshot();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const snapshots = await db
    .select()
    .from(portfolioSnapshots)
    .where(gte(portfolioSnapshots.snapshotDate, cutoffStr))
    .orderBy(portfolioSnapshots.snapshotDate);

  return snapshots.map((s) => ({
    date: s.snapshotDate,
    totalValueUsd: parseFloat(s.totalValueUsd),
    totalValueCad: parseFloat(s.totalValueCad),
    totalCostCad: parseFloat(s.totalCostCad),
    cardCount: s.cardCount,
    pricedCount: s.pricedCount,
  }));
}
