import { db } from "./index";
import { pricingJobs } from "./schema/pricing-jobs";
import { priceEstimates } from "./schema/prices";
import { eq, and, or, gt, sql } from "drizzle-orm";

export interface CardPricePayload {
  playerName: string;
  year?: number;
  setName?: string;
  manufacturer?: string;
  cardNumber?: string;
  parallelVariant?: string;
  isAutograph?: boolean;
  subsetOrInsert?: string;
  graded?: boolean;
  gradingCompany?: string;
  grade?: string;
}

/**
 * Enqueue a price lookup job for a card.
 * Deduplicates: won't create if a pending/running job exists or if data is fresh (< 24h).
 * Returns the job if created, null if skipped.
 */
export async function enqueuePriceLookup(
  cardId: string,
  payload: CardPricePayload
): Promise<{ id: string; status: string } | null> {
  // Check for existing pending/running job (dedup)
  const [existing] = await db
    .select({ id: pricingJobs.id, status: pricingJobs.status })
    .from(pricingJobs)
    .where(
      and(
        eq(pricingJobs.cardId, cardId),
        eq(pricingJobs.jobType, "price_lookup"),
        or(
          eq(pricingJobs.status, "pending"),
          eq(pricingJobs.status, "running")
        )
      )
    )
    .limit(1);

  if (existing) {
    console.log(`[jobs] Skipped enqueue for card ${cardId} — already ${existing.status}`);
    return existing;
  }

  // Check freshness — skip if priced within 24 hours
  const [recentEstimate] = await db
    .select({ id: priceEstimates.id })
    .from(priceEstimates)
    .where(
      and(
        eq(priceEstimates.cardId, cardId),
        gt(priceEstimates.lastUpdated, sql`NOW() - INTERVAL '24 hours'`)
      )
    )
    .limit(1);

  if (recentEstimate) {
    console.log(`[jobs] Skipped enqueue for card ${cardId} — priced within 24 hours`);
    return null;
  }

  // Insert job
  const [job] = await db
    .insert(pricingJobs)
    .values({
      cardId,
      jobType: "price_lookup",
      status: "pending",
      payload: payload as unknown as Record<string, unknown>,
    })
    .returning({ id: pricingJobs.id, status: pricingJobs.status });

  console.log(`[jobs] Enqueued price_lookup for card ${cardId} → job ${job.id}`);
  return job;
}
