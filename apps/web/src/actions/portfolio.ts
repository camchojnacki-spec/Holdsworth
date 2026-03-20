"use server";

import { db, cards, players, sets, manufacturers, priceEstimates, cardPhotos, priceHistory, priceSources } from "@holdsworth/db";
import { eq, desc, sql, and, isNotNull } from "drizzle-orm";

// ── Portfolio Overview ──

export interface PortfolioStats {
  totalCards: number;
  pricedCards: number;
  totalValueUsd: number;
  totalValueCad: number;
  totalCostCad: number;
  unrealizedGainCad: number;
  topCards: Array<{
    id: string;
    playerName: string;
    year: number | null;
    setName: string | null;
    cardNumber: string | null;
    parallelVariant: string | null;
    valueUsd: number;
    valueCad: number;
    trend: string;
    trendPct: number;
    thumbnailUrl: string | null;
  }>;
  biggestMovers: Array<{
    id: string;
    playerName: string;
    setName: string | null;
    trend: string;
    trendPct: number;
    valueUsd: number;
    valueCad: number;
  }>;
  recentComps: Array<{
    playerName: string;
    cardId: string;
    priceUsd: string;
    saleDate: Date | null;
    sourceName: string;
    listingTitle: string | null;
  }>;
  byStatus: {
    inCollection: number;
    forSale: number;
    sold: number;
  };
}

export async function getPortfolioStats(): Promise<PortfolioStats> {
  // Total cards + cost
  const [countResult] = await db
    .select({
      total: sql<number>`count(*)::int`,
      inCollection: sql<number>`count(*) filter (where ${cards.status} = 'in_collection')::int`,
      forSale: sql<number>`count(*) filter (where ${cards.status} = 'for_sale')::int`,
      sold: sql<number>`count(*) filter (where ${cards.status} = 'sold')::int`,
      totalCostCad: sql<string>`coalesce(sum(
        case
          when ${cards.purchaseCurrency} = 'CAD' then ${cards.purchasePrice}::numeric
          when ${cards.purchaseCurrency} = 'USD' then ${cards.purchasePrice}::numeric * 1.38
          else ${cards.purchasePrice}::numeric
        end
      ), 0)`,
    })
    .from(cards);

  // Portfolio value (only in_collection + for_sale)
  const [valueResult] = await db
    .select({
      totalUsd: sql<string>`coalesce(sum(${priceEstimates.estimatedValueUsd}::numeric), 0)`,
      totalCad: sql<string>`coalesce(sum(${priceEstimates.estimatedValueCad}::numeric), 0)`,
      pricedCards: sql<number>`count(*)::int`,
    })
    .from(priceEstimates)
    .innerJoin(cards, and(eq(priceEstimates.cardId, cards.id), sql`${cards.status} != 'sold'`));

  // Top 5 most valuable cards
  const topCards = await db
    .select({
      id: cards.id,
      playerName: players.name,
      year: cards.year,
      setName: sets.name,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      valueUsd: priceEstimates.estimatedValueUsd,
      valueCad: priceEstimates.estimatedValueCad,
      trend: priceEstimates.priceTrend,
      trendPct: priceEstimates.trendPercentage,
      thumbnailUrl: cardPhotos.originalUrl,
    })
    .from(priceEstimates)
    .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(cardPhotos, and(eq(cardPhotos.cardId, cards.id), eq(cardPhotos.photoType, "front")))
    .where(sql`${cards.status} != 'sold'`)
    .orderBy(desc(sql`${priceEstimates.estimatedValueUsd}::numeric`))
    .limit(5);

  // Biggest movers (highest absolute trend percentage)
  const biggestMovers = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      trend: priceEstimates.priceTrend,
      trendPct: priceEstimates.trendPercentage,
      valueUsd: priceEstimates.estimatedValueUsd,
      valueCad: priceEstimates.estimatedValueCad,
    })
    .from(priceEstimates)
    .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(and(
      isNotNull(priceEstimates.trendPercentage),
      sql`${cards.status} != 'sold'`,
      sql`abs(${priceEstimates.trendPercentage}::numeric) > 0`
    ))
    .orderBy(desc(sql`abs(${priceEstimates.trendPercentage}::numeric)`))
    .limit(5);

  // Recent comp sales across all cards
  const recentComps = await db
    .select({
      playerName: players.name,
      cardId: priceHistory.cardId,
      priceUsd: priceHistory.priceUsd,
      saleDate: priceHistory.saleDate,
      sourceName: priceSources.name,
      listingTitle: priceHistory.listingTitle,
    })
    .from(priceHistory)
    .innerJoin(cards, eq(priceHistory.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(priceSources, eq(priceHistory.sourceId, priceSources.id))
    .orderBy(desc(priceHistory.createdAt))
    .limit(10);

  const totalCostCad = parseFloat(countResult?.totalCostCad ?? "0");
  const totalValueCad = parseFloat(valueResult?.totalCad ?? "0");

  return {
    totalCards: countResult?.total ?? 0,
    pricedCards: valueResult?.pricedCards ?? 0,
    totalValueUsd: parseFloat(valueResult?.totalUsd ?? "0"),
    totalValueCad,
    totalCostCad,
    unrealizedGainCad: totalValueCad - totalCostCad,
    topCards: topCards.map(c => ({
      id: c.id,
      playerName: c.playerName ?? "Unknown",
      year: c.year,
      setName: c.setName ?? null,
      cardNumber: c.cardNumber ?? null,
      parallelVariant: c.parallelVariant ?? null,
      valueUsd: parseFloat(c.valueUsd ?? "0"),
      valueCad: parseFloat(c.valueCad ?? "0"),
      trend: c.trend ?? "stable",
      trendPct: parseFloat(c.trendPct ?? "0"),
      thumbnailUrl: c.thumbnailUrl ?? null,
    })),
    biggestMovers: biggestMovers.map(m => ({
      id: m.id,
      playerName: m.playerName ?? "Unknown",
      setName: m.setName ?? null,
      trend: m.trend ?? "stable",
      trendPct: parseFloat(m.trendPct ?? "0"),
      valueUsd: parseFloat(m.valueUsd ?? "0"),
      valueCad: parseFloat(m.valueCad ?? "0"),
    })),
    recentComps: recentComps.map(r => ({
      playerName: r.playerName ?? "Unknown",
      cardId: r.cardId,
      priceUsd: r.priceUsd ?? "0",
      saleDate: r.saleDate,
      sourceName: r.sourceName ?? "Unknown",
      listingTitle: r.listingTitle ?? null,
    })),
    byStatus: {
      inCollection: countResult?.inCollection ?? 0,
      forSale: countResult?.forSale ?? 0,
      sold: countResult?.sold ?? 0,
    },
  };
}
