"use server";

import { db, correctionLog, priceEstimates, cards, players, sets, setImportAttempts } from "@holdsworth/db";
import { eq, gt, sql, and, or, desc, isNotNull } from "drizzle-orm";

/**
 * Get top AI correction patterns from the last 30 days.
 */
export async function getCorrectionPatterns() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const patterns = await db
    .select({
      fieldName: correctionLog.fieldName,
      aiOriginalValue: correctionLog.aiOriginalValue,
      userCorrectedValue: correctionLog.userCorrectedValue,
      frequency: sql<number>`COUNT(*)::int`,
    })
    .from(correctionLog)
    .where(gt(correctionLog.createdAt, thirtyDaysAgo))
    .groupBy(
      correctionLog.fieldName,
      correctionLog.aiOriginalValue,
      correctionLog.userCorrectedValue
    )
    .having(sql`COUNT(*) >= 2`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(20);

  return patterns;
}

/**
 * Get cards with low pricing confidence.
 */
export async function getLowConfidenceCards() {
  const results = await db
    .select({
      cardId: cards.id,
      playerName: sql<string>`COALESCE(${players.name}, 'Unknown')`,
      year: cards.year,
      setName: sql<string>`COALESCE(${sets.name}, 'Unknown Set')`,
      parallelVariant: cards.parallelVariant,
      confidence: priceEstimates.confidence,
      sampleSize: priceEstimates.sampleSize,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
    })
    .from(priceEstimates)
    .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(
      and(
        or(
          eq(priceEstimates.confidence, "low"),
          eq(priceEstimates.confidence, "very_low")
        ),
        sql`${cards.deletedAt} IS NULL`
      )
    )
    .orderBy(desc(priceEstimates.lastUpdated))
    .limit(50);

  return results;
}

/**
 * Get recent TCDB import attempts.
 */
export async function getImportAttempts() {
  const results = await db
    .select()
    .from(setImportAttempts)
    .orderBy(desc(setImportAttempts.lastAttempted))
    .limit(50);

  return results;
}
