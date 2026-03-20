"use server";

import {
  db,
  cards,
  players,
  sets,
  priceEstimates,
  cardPhotos,
  portfolioSnapshots,
} from "@holdsworth/db";
import { eq, desc, sql, isNull, and, isNotNull } from "drizzle-orm";

export interface DashboardData {
  totalValueUsd: number;
  totalValueCad: number;
  totalCost: number;
  cardCount: number;
  pricedCount: number;
  topCards: Array<{
    id: string;
    playerName: string | null;
    setName: string | null;
    year: number | null;
    cardNumber: string | null;
    parallelVariant: string | null;
    thumbnailUrl: string | null;
    originalUrl: string | null;
    estimatedValueCad: string | null;
    estimatedValueUsd: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    playerName: string | null;
    setName: string | null;
    year: number | null;
    updatedAt: Date;
    createdAt: Date;
  }>;
  valueTrend: {
    direction: "up" | "down" | "stable";
    percentage: number;
  };
  gradingCandidates: Array<{
    id: string;
    playerName: string | null;
    setName: string | null;
    year: number | null;
    condition: string | null;
    rawEstimateUsd: number;
    gradedEstimateUsd: number;
    gradingCostUsd: number;
    netBenefit: number;
    predictedGrade: number;
    recommendation: string;
  }>;
  valueDistribution: Array<{
    tier: string;
    count: number;
    totalValue: number;
  }>;
  portfolioHistory: Array<{
    date: string;
    valueCad: number;
  }>;
}

export async function getDashboardData(): Promise<DashboardData> {
  // ── Aggregate metrics ──
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(isNull(cards.deletedAt));
  const cardCount = countResult?.count ?? 0;

  const [valueResult] = await db
    .select({
      totalUsd: sql<string>`coalesce(sum(${priceEstimates.estimatedValueUsd}::numeric), 0)`,
      totalCad: sql<string>`coalesce(sum(${priceEstimates.estimatedValueCad}::numeric), 0)`,
      pricedCount: sql<number>`count(${priceEstimates.id})::int`,
    })
    .from(priceEstimates)
    .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
    .where(isNull(cards.deletedAt));

  const totalValueUsd = parseFloat(valueResult?.totalUsd ?? "0");
  const totalValueCad = parseFloat(valueResult?.totalCad ?? "0");
  const pricedCount = valueResult?.pricedCount ?? 0;

  const [costResult] = await db
    .select({
      totalCost: sql<string>`coalesce(sum(${cards.purchasePrice}::numeric), 0)`,
    })
    .from(cards)
    .where(isNull(cards.deletedAt));
  const totalCost = parseFloat(costResult?.totalCost ?? "0");

  // ── Top 10 Cards by Value ──
  const topCards = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      year: cards.year,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      thumbnailUrl: cardPhotos.thumbnailUrl,
      originalUrl: cardPhotos.originalUrl,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(
      cardPhotos,
      and(eq(cardPhotos.cardId, cards.id), eq(cardPhotos.photoType, "front"))
    )
    .innerJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(
      and(
        isNull(cards.deletedAt),
        isNotNull(priceEstimates.estimatedValueUsd)
      )
    )
    .orderBy(desc(sql`${priceEstimates.estimatedValueUsd}::numeric`))
    .limit(10);

  // ── Recent Activity ──
  const recentActivity = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      year: cards.year,
      updatedAt: cards.updatedAt,
      createdAt: cards.createdAt,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(isNull(cards.deletedAt))
    .orderBy(desc(cards.updatedAt))
    .limit(10);

  // ── Value Trend (from portfolio snapshots) ──
  const snapshots = await db
    .select({
      date: portfolioSnapshots.snapshotDate,
      valueCad: portfolioSnapshots.totalValueCad,
    })
    .from(portfolioSnapshots)
    .orderBy(desc(portfolioSnapshots.snapshotDate))
    .limit(30);

  let valueTrend: DashboardData["valueTrend"] = {
    direction: "stable",
    percentage: 0,
  };
  if (snapshots.length >= 2) {
    const latest = parseFloat(snapshots[0].valueCad);
    const previous = parseFloat(snapshots[1].valueCad);
    if (previous > 0) {
      const pct = ((latest - previous) / previous) * 100;
      valueTrend = {
        direction: pct > 1 ? "up" : pct < -1 ? "down" : "stable",
        percentage: Math.round(pct * 10) / 10,
      };
    }
  }

  // ── Grading Candidates (cards with grade reports showing positive ROI) ──
  const allCardsWithMeta = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      year: cards.year,
      condition: cards.condition,
      metadata: cards.metadata,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(
      and(
        isNull(cards.deletedAt),
        isNotNull(cards.metadata)
      )
    );

  const gradingCandidates: DashboardData["gradingCandidates"] = [];
  for (const c of allCardsWithMeta) {
    const meta = c.metadata as Record<string, unknown> | null;
    if (!meta?.gradeReport) continue;
    const report = meta.gradeReport as {
      overallGrade?: number;
      gradedVsRaw?: {
        shouldGrade?: boolean;
        rawEstimateUsd?: number;
        gradedEstimateUsd?: number;
        gradingCostUsd?: number;
        netGradingBenefit?: number;
        recommendation?: string;
      };
    };
    if (!report.gradedVsRaw?.shouldGrade) continue;
    gradingCandidates.push({
      id: c.id,
      playerName: c.playerName,
      setName: c.setName,
      year: c.year,
      condition: c.condition,
      rawEstimateUsd: report.gradedVsRaw.rawEstimateUsd ?? 0,
      gradedEstimateUsd: report.gradedVsRaw.gradedEstimateUsd ?? 0,
      gradingCostUsd: report.gradedVsRaw.gradingCostUsd ?? 20,
      netBenefit: report.gradedVsRaw.netGradingBenefit ?? 0,
      predictedGrade: report.overallGrade ?? 0,
      recommendation: report.gradedVsRaw.recommendation ?? "",
    });
  }
  gradingCandidates.sort((a, b) => b.netBenefit - a.netBenefit);

  // ── Value Distribution by Tier ──
  const tiers = [
    { tier: "$0-1", min: 0, max: 1 },
    { tier: "$1-5", min: 1, max: 5 },
    { tier: "$5-20", min: 5, max: 20 },
    { tier: "$20-50", min: 20, max: 50 },
    { tier: "$50-100", min: 50, max: 100 },
    { tier: "$100+", min: 100, max: 999999 },
  ];

  const valueDistribution: DashboardData["valueDistribution"] = [];
  for (const t of tiers) {
    const [result] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${priceEstimates.estimatedValueUsd}::numeric), 0)`,
      })
      .from(priceEstimates)
      .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
      .where(
        and(
          isNull(cards.deletedAt),
          sql`${priceEstimates.estimatedValueUsd}::numeric >= ${t.min}`,
          sql`${priceEstimates.estimatedValueUsd}::numeric < ${t.max}`
        )
      );
    valueDistribution.push({
      tier: t.tier,
      count: result?.count ?? 0,
      totalValue: parseFloat(result?.total ?? "0"),
    });
  }

  // ── Portfolio History (for sparkline) ──
  const portfolioHistory = snapshots
    .map((s) => ({
      date: s.date,
      valueCad: parseFloat(s.valueCad),
    }))
    .reverse();

  return {
    totalValueUsd,
    totalValueCad,
    totalCost,
    cardCount,
    pricedCount,
    topCards,
    recentActivity,
    valueTrend,
    gradingCandidates,
    valueDistribution,
    portfolioHistory,
  };
}
