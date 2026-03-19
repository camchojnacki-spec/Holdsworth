"use server";

import { db, cards, players, sets, manufacturers, cardPhotos, priceEstimates } from "@holdsworth/db";
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
  return { id: card.id };
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
