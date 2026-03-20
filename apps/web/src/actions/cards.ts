"use server";

import { db, cards, players, sets, manufacturers, cardPhotos, priceEstimates, priceSources, priceHistory, pricingJobs, enqueuePriceLookup } from "@holdsworth/db";
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
  backPhotoUrl?: string;
  isAutograph?: boolean;
  isRelic?: boolean;
  subsetOrInsert?: string;
  referenceCardId?: string;
  aiCorrected?: boolean;
}

export async function createCard(input: CreateCardInput): Promise<{ id: string }> {
  // All DB writes in a transaction — if any insert fails, everything rolls back
  const card = await db.transaction(async (tx) => {
    // Find or create player
    let playerId: string | undefined;
    if (input.playerName) {
      const existing = await tx
        .select()
        .from(players)
        .where(ilike(players.name, input.playerName))
        .limit(1);

      if (existing.length > 0) {
        playerId = existing[0].id;
        if (input.team || input.position) {
          await tx
            .update(players)
            .set({
              ...(input.team ? { team: input.team } : {}),
              ...(input.position ? { position: input.position } : {}),
              updatedAt: new Date(),
            })
            .where(eq(players.id, playerId));
        }
      } else {
        const [newPlayer] = await tx
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
      const existing = await tx
        .select()
        .from(manufacturers)
        .where(ilike(manufacturers.name, input.manufacturer))
        .limit(1);

      if (existing.length > 0) {
        manufacturerId = existing[0].id;
      } else {
        const [newMfg] = await tx
          .insert(manufacturers)
          .values({ name: input.manufacturer })
          .returning();
        manufacturerId = newMfg.id;
      }
    }

    // Find or create set
    let setId: string | undefined;
    if (input.setName && input.year) {
      const existing = await tx
        .select()
        .from(sets)
        .where(
          and(ilike(sets.name, input.setName), eq(sets.year, input.year))
        )
        .limit(1);

      if (existing.length > 0) {
        setId = existing[0].id;
      } else {
        const [newSet] = await tx
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
    const [newCard] = await tx
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

    // Save front photo
    if (input.photoUrl) {
      await tx.insert(cardPhotos).values({
        cardId: newCard.id,
        originalUrl: input.photoUrl,
        photoType: "front",
      });
    }

    // Save back photo
    if (input.backPhotoUrl) {
      await tx.insert(cardPhotos).values({
        cardId: newCard.id,
        originalUrl: input.backPhotoUrl,
        photoType: "back",
      });
    }

    return newCard;
  });

  revalidatePath("/cards");
  revalidatePath("/");

  // Enqueue price lookup outside transaction (separate concern)
  await enqueuePriceLookup(card.id, {
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
  });

  return { id: card.id };
}

/**
 * Get the pricing job status for a card.
 * Used by the frontend to show real engine status instead of blind polling.
 */
export async function getCardPricingStatus(cardId: string) {
  const [job] = await db
    .select({
      status: pricingJobs.status,
      errorMessage: pricingJobs.errorMessage,
      createdAt: pricingJobs.createdAt,
      completedAt: pricingJobs.completedAt,
    })
    .from(pricingJobs)
    .where(eq(pricingJobs.cardId, cardId))
    .orderBy(desc(pricingJobs.createdAt))
    .limit(1);

  return {
    status: (job?.status as "pending" | "running" | "completed" | "failed") ?? "none",
    errorMessage: job?.errorMessage ?? null,
    createdAt: job?.createdAt ?? null,
    completedAt: job?.completedAt ?? null,
  };
}

/**
 * Force re-scout the market for a card.
 * Bypasses the 24-hour freshness check and enqueues a new pricing job.
 */
export async function rescoutCard(cardId: string) {
  // Delete any existing pending/running jobs for this card
  await db
    .delete(pricingJobs)
    .where(
      and(
        eq(pricingJobs.cardId, cardId),
        or(eq(pricingJobs.status, "pending"), eq(pricingJobs.status, "running"))
      )
    );

  // Clear existing price data so fresh results replace them
  await db.delete(priceHistory).where(eq(priceHistory.cardId, cardId));
  await db.delete(priceEstimates).where(eq(priceEstimates.cardId, cardId));

  // Get card data for the payload
  const [card] = await db
    .select({
      playerName: players.name,
      year: cards.year,
      setName: sets.name,
      manufacturer: manufacturers.name,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      isAutograph: cards.isAutograph,
      subsetOrInsert: cards.subsetOrInsert,
      graded: cards.graded,
      gradingCompany: cards.gradingCompany,
      grade: cards.grade,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card?.playerName) return { success: false };

  // Enqueue fresh job (bypasses freshness check since we deleted the estimate)
  await enqueuePriceLookup(cardId, {
    playerName: card.playerName,
    year: card.year ?? undefined,
    setName: card.setName ?? undefined,
    manufacturer: card.manufacturer ?? undefined,
    cardNumber: card.cardNumber ?? undefined,
    parallelVariant: card.parallelVariant ?? undefined,
    isAutograph: card.isAutograph ?? undefined,
    subsetOrInsert: card.subsetOrInsert ?? undefined,
    graded: card.graded ?? undefined,
    gradingCompany: card.gradingCompany ?? undefined,
    grade: card.grade ?? undefined,
  });

  revalidatePath(`/cards/${cardId}`);
  return { success: true };
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

  // Fetch back photo separately
  const [backPhoto] = await db
    .select({ originalUrl: cardPhotos.originalUrl })
    .from(cardPhotos)
    .where(and(eq(cardPhotos.cardId, id), eq(cardPhotos.photoType, "back")))
    .limit(1);

  const result = rows[0] as CardWithDetails;
  if (backPhoto?.originalUrl) {
    (result as CardWithDetails & { backPhotoUrl?: string }).backPhotoUrl = backPhoto.originalUrl;
  }
  return result;
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
    listingTitle: string | null;
    matchScore: number | null;
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
      listingTitle: priceHistory.listingTitle,
      matchScore: priceHistory.matchScore,
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
      listingTitle: h.listingTitle ?? null,
      matchScore: h.matchScore ?? null,
      sourceName: h.sourceName ?? "Unknown",
    })),
  };
}
