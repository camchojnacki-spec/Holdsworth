"use server";

import { db, cards, players, sets, manufacturers, cardPhotos, priceEstimates, priceSources, priceHistory } from "@holdsworth/db";
import { eq, desc, ilike, and, sql, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { CardWithDetails } from "@/types/cards";

// ── Create ──

export interface CreateCardInput {
  playerName: string;
  team?: string;
  position?: string;
  year?: number;
  setName?: string;
  manufacturer?: string;
  cardNumber?: string;
  parallelVariant?: string;
  isRookieCard?: boolean;
  condition?: string;
  conditionNotes?: string;
  graded?: boolean;
  gradingCompany?: string;
  grade?: string;
  quantity?: number;
  purchasePrice?: string;
  purchaseCurrency?: string;
  purchaseDate?: string;
  purchaseSource?: string;
  notes?: string;
  aiRawResponse?: Record<string, unknown>;
  photoUrl?: string;
  isAutograph?: boolean;
  isRelic?: boolean;
  subsetOrInsert?: string;
  referenceCardId?: string;
  aiCorrected?: boolean;
}

export async function createCard(input: CreateCardInput): Promise<{ id: string }> {
  // Find or create player
  let playerId: string | undefined;
  if (input.playerName) {
    const existing = await db
      .select()
      .from(players)
      .where(ilike(players.name, input.playerName))
      .limit(1);

    if (existing.length > 0) {
      playerId = existing[0].id;
      // Update team/position if provided and different
      if (input.team || input.position) {
        await db
          .update(players)
          .set({
            ...(input.team ? { team: input.team } : {}),
            ...(input.position ? { position: input.position } : {}),
            updatedAt: new Date(),
          })
          .where(eq(players.id, playerId));
      }
    } else {
      const [newPlayer] = await db
        .insert(players)
        .values({
          name: input.playerName,
          team: input.team ?? null,
          position: input.position ?? null,
        })
        .returning();
      playerId = newPlayer.id;
    }
  }

  // Find or create manufacturer
  let manufacturerId: string | undefined;
  if (input.manufacturer) {
    const existing = await db
      .select()
      .from(manufacturers)
      .where(ilike(manufacturers.name, input.manufacturer))
      .limit(1);

    if (existing.length > 0) {
      manufacturerId = existing[0].id;
    } else {
      const [newMfg] = await db
        .insert(manufacturers)
        .values({ name: input.manufacturer })
        .returning();
      manufacturerId = newMfg.id;
    }
  }

  // Find or create set
  let setId: string | undefined;
  if (input.setName && input.year) {
    const existing = await db
      .select()
      .from(sets)
      .where(
        and(ilike(sets.name, input.setName), eq(sets.year, input.year))
      )
      .limit(1);

    if (existing.length > 0) {
      setId = existing[0].id;
    } else {
      const [newSet] = await db
        .insert(sets)
        .values({
          name: input.setName,
          year: input.year,
          manufacturerId: manufacturerId ?? null,
        })
        .returning();
      setId = newSet.id;
    }
  }

  // Create the card
  const [card] = await db
    .insert(cards)
    .values({
      playerId: playerId ?? null,
      setId: setId ?? null,
      cardNumber: input.cardNumber ?? null,
      year: input.year ?? null,
      parallelVariant: input.parallelVariant ?? null,
      isRookieCard: input.isRookieCard ?? false,
      condition: input.condition ?? null,
      conditionNotes: input.conditionNotes ?? null,
      graded: input.graded ?? false,
      gradingCompany: input.gradingCompany ?? null,
      grade: input.grade ?? null,
      quantity: input.quantity ?? 1,
      purchasePrice: input.purchasePrice ?? null,
      purchaseCurrency: input.purchaseCurrency ?? "CAD",
      purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
      purchaseSource: input.purchaseSource ?? null,
      notes: input.notes ?? null,
      aiRawResponse: input.aiRawResponse ?? null,
      referenceCardId: input.referenceCardId ?? null,
      subsetOrInsert: input.subsetOrInsert ?? null,
      isAutograph: input.isAutograph ?? false,
      isRelic: input.isRelic ?? false,
      aiCorrected: input.aiCorrected ?? false,
      status: "in_collection",
    })
    .returning();

  // If a photo URL was provided, create the photo record
  if (input.photoUrl) {
    await db.insert(cardPhotos).values({
      cardId: card.id,
      originalUrl: input.photoUrl,
      photoType: "front",
    });
  }

  revalidatePath("/cards");
  revalidatePath("/");

  // Fire-and-forget: trigger background price lookup
  queuePriceLookup(card.id, {
    playerName: input.playerName,
    year: input.year,
    setName: input.setName,
    manufacturer: input.manufacturer,
    cardNumber: input.cardNumber,
    parallelVariant: input.parallelVariant,
    isAutograph: input.isAutograph,
    subsetOrInsert: input.subsetOrInsert,
    graded: input.graded,
    gradingCompany: input.gradingCompany,
    grade: input.grade,
  }).catch((err) => console.error("[cards] Background price lookup failed:", err));

  return { id: card.id };
}

/**
 * Queue a background price lookup for a card.
 * Runs asynchronously — does not block card creation.
 * Stores results in priceEstimates table.
 */
async function queuePriceLookup(cardId: string, card: {
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
}) {
  const { lookupCardPrice } = await import("./prices");

  console.log(`[prices] Background lookup started for card ${cardId}`);
  const result = await lookupCardPrice(card);

  if (result.estimatedValue) {
    const usdToCad = 1.38;
    await db.insert(priceEstimates).values({
      cardId,
      estimatedValueUsd: String(result.estimatedValue.mid),
      estimatedValueCad: String(Math.round(result.estimatedValue.mid * usdToCad * 100) / 100),
      confidence: result.dataSources.some(s => !s.includes("AI")) ? "medium" : "low",
      sampleSize: result.stats?.count ?? 0,
      priceTrend: "stable",
    }).onConflictDoUpdate({
      target: priceEstimates.cardId,
      set: {
        estimatedValueUsd: String(result.estimatedValue.mid),
        estimatedValueCad: String(Math.round(result.estimatedValue.mid * usdToCad * 100) / 100),
        confidence: result.dataSources.some(s => !s.includes("AI")) ? "medium" : "low",
        sampleSize: result.stats?.count ?? 0,
        lastUpdated: new Date(),
      },
    });
    console.log(`[prices] Stored estimate for card ${cardId}: $${result.estimatedValue.mid} USD`);
  }

  // Store individual comps in priceHistory
  if (result.listings.length > 0) {
    // Ensure eBay source exists
    let [ebaySource] = await db.select().from(priceSources).where(eq(priceSources.name, "eBay")).limit(1);
    if (!ebaySource) {
      [ebaySource] = await db.insert(priceSources).values({ name: "eBay", baseUrl: "https://www.ebay.com", scraperType: "playwright" }).returning();
    }

    for (const listing of result.listings.slice(0, 10)) {
      await db.insert(priceHistory).values({
        cardId,
        sourceId: ebaySource.id,
        priceUsd: String(listing.price),
        priceCad: String(Math.round(listing.price * 1.38 * 100) / 100),
        currencyRate: "1.38",
        saleDate: listing.date ? new Date(listing.date) : null,
        listingUrl: listing.url || null,
        condition: null,
        graded: false,
      }).catch(() => {}); // Skip duplicates
    }
    console.log(`[prices] Stored ${Math.min(result.listings.length, 10)} comps for card ${cardId}`);
  }

  revalidatePath(`/cards/${cardId}`);
}

// ── Read ──

export async function getCards(filters?: {
  search?: string;
  year?: string;
  status?: string;
}): Promise<CardWithDetails[]> {
  const conditions = [];

  if (filters?.status) {
    conditions.push(eq(cards.status, filters.status));
  }
  if (filters?.year) {
    const yearNum = parseInt(filters.year);
    if (!isNaN(yearNum)) {
      conditions.push(eq(cards.year, yearNum));
    }
  }

  const rows = await db
    .select({
      id: cards.id,
      cardNumber: cards.cardNumber,
      year: cards.year,
      parallelVariant: cards.parallelVariant,
      isRookieCard: cards.isRookieCard,
      condition: cards.condition,
      conditionNotes: cards.conditionNotes,
      graded: cards.graded,
      gradingCompany: cards.gradingCompany,
      grade: cards.grade,
      quantity: cards.quantity,
      purchasePrice: cards.purchasePrice,
      purchaseCurrency: cards.purchaseCurrency,
      purchaseDate: cards.purchaseDate,
      purchaseSource: cards.purchaseSource,
      status: cards.status,
      notes: cards.notes,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
      playerName: players.name,
      playerTeam: players.team,
      setName: sets.name,
      manufacturerName: manufacturers.name,
      thumbnailUrl: cardPhotos.thumbnailUrl,
      originalUrl: cardPhotos.originalUrl,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
      priceTrend: priceEstimates.priceTrend,
      trendPercentage: priceEstimates.trendPercentage,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .leftJoin(
      cardPhotos,
      and(eq(cardPhotos.cardId, cards.id), eq(cardPhotos.photoType, "front"))
    )
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(cards.createdAt));

  let results = rows as CardWithDetails[];

  // Client-side search filter (searches player name, set name, card number)
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.playerName?.toLowerCase().includes(term) ||
        c.setName?.toLowerCase().includes(term) ||
        c.cardNumber?.toLowerCase().includes(term)
    );
  }

  return results;
}

export async function getCardById(id: string): Promise<CardWithDetails | null> {
  const rows = await db
    .select({
      id: cards.id,
      cardNumber: cards.cardNumber,
      year: cards.year,
      parallelVariant: cards.parallelVariant,
      isRookieCard: cards.isRookieCard,
      condition: cards.condition,
      conditionNotes: cards.conditionNotes,
      graded: cards.graded,
      gradingCompany: cards.gradingCompany,
      grade: cards.grade,
      quantity: cards.quantity,
      purchasePrice: cards.purchasePrice,
      purchaseCurrency: cards.purchaseCurrency,
      purchaseDate: cards.purchaseDate,
      purchaseSource: cards.purchaseSource,
      status: cards.status,
      notes: cards.notes,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
      playerName: players.name,
      playerTeam: players.team,
      setName: sets.name,
      manufacturerName: manufacturers.name,
      thumbnailUrl: cardPhotos.thumbnailUrl,
      originalUrl: cardPhotos.originalUrl,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
      priceTrend: priceEstimates.priceTrend,
      trendPercentage: priceEstimates.trendPercentage,
      isAutograph: cards.isAutograph,
      subsetOrInsert: cards.subsetOrInsert,
      aiCorrected: cards.aiCorrected,
      referenceCardId: cards.referenceCardId,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .leftJoin(
      cardPhotos,
      and(eq(cardPhotos.cardId, cards.id), eq(cardPhotos.photoType, "front"))
    )
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(eq(cards.id, id))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0] as CardWithDetails;
}

// ── Dashboard Stats ──

export async function getDashboardStats() {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards);

  const [valueResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${priceEstimates.estimatedValueCad}::numeric), 0)`,
    })
    .from(priceEstimates);

  return {
    totalCards: countResult?.count ?? 0,
    totalValue: parseFloat(valueResult?.total ?? "0"),
  };
}

// ── Delete ──

export async function deleteCard(id: string) {
  await db.delete(cards).where(eq(cards.id, id));
  revalidatePath("/cards");
  revalidatePath("/");
}

// ── Get cached comps from database ──

export interface CachedComps {
  estimate: {
    valueUsd: number;
    valueCad: number;
    confidence: string;
    sampleSize: number;
    trend: string;
    lastUpdated: Date;
  } | null;
  history: Array<{
    priceUsd: string;
    priceCad: string;
    saleDate: Date | null;
    listingUrl: string | null;
    sourceName: string;
  }>;
}

export async function getCardComps(cardId: string): Promise<CachedComps> {
  // Get cached estimate
  const [estimate] = await db
    .select()
    .from(priceEstimates)
    .where(eq(priceEstimates.cardId, cardId))
    .limit(1);

  // Get price history (recent comps)
  const history = await db
    .select({
      priceUsd: priceHistory.priceUsd,
      priceCad: priceHistory.priceCad,
      saleDate: priceHistory.saleDate,
      listingUrl: priceHistory.listingUrl,
      sourceName: priceSources.name,
    })
    .from(priceHistory)
    .leftJoin(priceSources, eq(priceHistory.sourceId, priceSources.id))
    .where(eq(priceHistory.cardId, cardId))
    .orderBy(desc(priceHistory.saleDate))
    .limit(15);

  return {
    estimate: estimate ? {
      valueUsd: parseFloat(estimate.estimatedValueUsd ?? "0"),
      valueCad: parseFloat(estimate.estimatedValueCad ?? "0"),
      confidence: estimate.confidence ?? "low",
      sampleSize: estimate.sampleSize ?? 0,
      trend: estimate.priceTrend ?? "stable",
      lastUpdated: estimate.lastUpdated,
    } : null,
    history: history.map(h => ({
      priceUsd: h.priceUsd ?? "0",
      priceCad: h.priceCad ?? "0",
      saleDate: h.saleDate,
      listingUrl: h.listingUrl,
      sourceName: h.sourceName ?? "Unknown",
    })),
  };
}
