"use server";

import { db, cards, players, correctionLog } from "@holdsworth/db";
import { eq, desc, sql, isNull, count } from "drizzle-orm";

export interface FieldAccuracy {
  total: number;
  corrected: number;
  accuracy: number;
}

export interface AccuracyMetrics {
  totalScans: number;
  totalCorrected: number;
  totalVerified: number;
  overallAccuracy: number;
  fieldAccuracy: {
    playerName: FieldAccuracy;
    setName: FieldAccuracy;
    year: FieldAccuracy;
    cardNumber: FieldAccuracy;
    parallel: FieldAccuracy;
  };
  recentCorrections: Array<{
    cardId: string;
    playerName: string;
    fieldName: string;
    aiValue: string;
    correctedValue: string;
    createdAt: Date;
  }>;
  correctionTrend: Array<{
    date: string;
    count: number;
  }>;
}

export async function getAccuracyMetrics(): Promise<AccuracyMetrics> {
  // Total scans (non-deleted cards)
  const [scanCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(isNull(cards.deletedAt));
  const totalScans = scanCount?.count ?? 0;

  // Total corrected (aiCorrected = true)
  const [correctedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(sql`${cards.aiCorrected} = true AND ${cards.deletedAt} IS NULL`);
  const totalCorrected = correctedCount?.count ?? 0;

  // Total verified (referenceCardId set)
  const [verifiedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(sql`${cards.referenceCardId} IS NOT NULL AND ${cards.deletedAt} IS NULL`);
  const totalVerified = verifiedCount?.count ?? 0;

  // Overall accuracy
  const overallAccuracy = totalScans > 0
    ? Math.round(((totalScans - totalCorrected) / totalScans) * 1000) / 10
    : 100;

  // Field-level accuracy from correction_log
  const fieldNames = ["playerName", "setName", "year", "cardNumber", "parallelVariant"] as const;
  const fieldAccuracyMap: Record<string, FieldAccuracy> = {};

  for (const field of fieldNames) {
    const [result] = await db
      .select({ count: sql<number>`count(DISTINCT ${correctionLog.cardId})::int` })
      .from(correctionLog)
      .where(eq(correctionLog.fieldName, field));
    const corrected = result?.count ?? 0;
    fieldAccuracyMap[field] = {
      total: totalScans,
      corrected,
      accuracy: totalScans > 0
        ? Math.round(((totalScans - corrected) / totalScans) * 1000) / 10
        : 100,
    };
  }

  const fieldAccuracy = {
    playerName: fieldAccuracyMap["playerName"],
    setName: fieldAccuracyMap["setName"],
    year: fieldAccuracyMap["year"],
    cardNumber: fieldAccuracyMap["cardNumber"],
    parallel: fieldAccuracyMap["parallelVariant"],
  };

  // Recent corrections (last 20)
  const recentRows = await db
    .select({
      cardId: correctionLog.cardId,
      playerName: players.name,
      fieldName: correctionLog.fieldName,
      aiValue: correctionLog.aiOriginalValue,
      correctedValue: correctionLog.userCorrectedValue,
      createdAt: correctionLog.createdAt,
    })
    .from(correctionLog)
    .leftJoin(cards, eq(correctionLog.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .orderBy(desc(correctionLog.createdAt))
    .limit(20);

  const recentCorrections = recentRows.map((r) => ({
    cardId: r.cardId,
    playerName: r.playerName ?? "Unknown",
    fieldName: r.fieldName,
    aiValue: r.aiValue ?? "",
    correctedValue: r.correctedValue ?? "",
    createdAt: r.createdAt,
  }));

  // Correction trend (last 30 days)
  const trendRows = await db
    .select({
      date: sql<string>`to_char(${correctionLog.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(correctionLog)
    .where(sql`${correctionLog.createdAt} >= now() - interval '30 days'`)
    .groupBy(sql`to_char(${correctionLog.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${correctionLog.createdAt}, 'YYYY-MM-DD')`);

  const correctionTrend = trendRows.map((r) => ({
    date: r.date,
    count: r.count,
  }));

  return {
    totalScans,
    totalCorrected,
    totalVerified,
    overallAccuracy,
    fieldAccuracy,
    recentCorrections,
    correctionTrend,
  };
}
