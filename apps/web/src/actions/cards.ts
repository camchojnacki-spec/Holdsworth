"use server";

import { db, cards, players, sets, manufacturers, cardPhotos, priceEstimates, priceSources, priceHistory, pricingJobs, correctionLog, enqueuePriceLookup, referenceCards, setProducts } from "@holdsworth/db";
import { eq, desc, ilike, and, sql, or, inArray, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { CardWithDetails } from "@/types/cards";
import { uploadCardPhoto } from "@/lib/gcs";
import { createCardSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

// ── Duplicate Check ──

export async function checkForDuplicates(input: {
  playerName: string;
  year?: number;
  setName?: string;
  cardNumber?: string;
  parallelVariant?: string;
}): Promise<Array<{ id: string; playerName: string; setName: string | null; year: number | null; cardNumber: string | null; parallelVariant: string | null }>> {
  const conditions = [ilike(players.name, input.playerName)];

  if (input.year) {
    conditions.push(eq(cards.year, input.year));
  }
  if (input.setName) {
    conditions.push(ilike(sets.name, input.setName));
  }
  if (input.cardNumber) {
    conditions.push(eq(cards.cardNumber, input.cardNumber));
  }

  const rows = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      year: cards.year,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
    })
    .from(cards)
    .innerJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(and(...conditions))
    .limit(5);

  return rows;
}

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
  // Validate input
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid card data: ${parsed.error.issues.map(i => i.message).join(", ")}`);
  }

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

    // Upload photos to GCS and save URLs (with optimized variants)
    if (input.photoUrl) {
      let photoUrl = input.photoUrl;
      let displayUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      if (input.photoUrl.startsWith("data:")) {
        try {
          const result = await uploadCardPhoto(input.photoUrl, newCard.id, "front");
          photoUrl = result.url;
          displayUrl = result.displayUrl;
          thumbnailUrl = result.thumbnailUrl;
        } catch (err) {
          console.error("[createCard] GCS upload failed for front photo, storing data URL:", err);
        }
      }
      await tx.insert(cardPhotos).values({
        cardId: newCard.id,
        originalUrl: photoUrl,
        displayUrl,
        thumbnailUrl,
        photoType: "front",
      });
    }

    if (input.backPhotoUrl) {
      let backUrl = input.backPhotoUrl;
      let backDisplayUrl: string | null = null;
      let backThumbnailUrl: string | null = null;
      if (input.backPhotoUrl.startsWith("data:")) {
        try {
          const result = await uploadCardPhoto(input.backPhotoUrl, newCard.id, "back");
          backUrl = result.url;
          backDisplayUrl = result.displayUrl;
          backThumbnailUrl = result.thumbnailUrl;
        } catch (err) {
          console.error("[createCard] GCS upload failed for back photo, storing data URL:", err);
        }
      }
      await tx.insert(cardPhotos).values({
        cardId: newCard.id,
        originalUrl: backUrl,
        displayUrl: backDisplayUrl,
        thumbnailUrl: backThumbnailUrl,
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

// ── Update ──

export interface UpdateCardInput {
  playerName?: string;
  team?: string;
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
  purchasePrice?: string;
  purchaseCurrency?: string;
  purchaseDate?: string;
  purchaseSource?: string;
  notes?: string;
  isAutograph?: boolean;
  subsetOrInsert?: string;
  status?: string;
}

export async function updateCard(cardId: string, input: UpdateCardInput): Promise<{ success: boolean }> {
  await db.transaction(async (tx) => {
    // Update player if name changed
    if (input.playerName) {
      const [card] = await tx.select({ playerId: cards.playerId }).from(cards).where(eq(cards.id, cardId)).limit(1);
      if (card?.playerId) {
        await tx.update(players).set({ name: input.playerName, ...(input.team ? { team: input.team } : {}), updatedAt: new Date() }).where(eq(players.id, card.playerId));
      } else {
        // Create new player
        const [newPlayer] = await tx.insert(players).values({ name: input.playerName, team: input.team ?? null }).returning();
        await tx.update(cards).set({ playerId: newPlayer.id }).where(eq(cards.id, cardId));
      }
    }

    // Update manufacturer if changed
    if (input.manufacturer) {
      const existing = await tx.select().from(manufacturers).where(ilike(manufacturers.name, input.manufacturer)).limit(1);
      let mfgId: string;
      if (existing.length > 0) {
        mfgId = existing[0].id;
      } else {
        const [newMfg] = await tx.insert(manufacturers).values({ name: input.manufacturer }).returning();
        mfgId = newMfg.id;
      }
      // Update set's manufacturer
      const [card] = await tx.select({ setId: cards.setId }).from(cards).where(eq(cards.id, cardId)).limit(1);
      if (card?.setId) {
        await tx.update(sets).set({ manufacturerId: mfgId }).where(eq(sets.id, card.setId));
      }
    }

    // Update set if changed
    if (input.setName && input.year) {
      const existing = await tx.select().from(sets).where(and(ilike(sets.name, input.setName), eq(sets.year, input.year))).limit(1);
      let setId: string;
      if (existing.length > 0) {
        setId = existing[0].id;
      } else {
        const [newSet] = await tx.insert(sets).values({ name: input.setName, year: input.year }).returning();
        setId = newSet.id;
      }
      await tx.update(cards).set({ setId }).where(eq(cards.id, cardId));
    }

    // Update card fields
    await tx.update(cards).set({
      ...(input.cardNumber !== undefined ? { cardNumber: input.cardNumber || null } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.parallelVariant !== undefined ? { parallelVariant: input.parallelVariant || null } : {}),
      ...(input.isRookieCard !== undefined ? { isRookieCard: input.isRookieCard } : {}),
      ...(input.condition !== undefined ? { condition: input.condition || null } : {}),
      ...(input.conditionNotes !== undefined ? { conditionNotes: input.conditionNotes || null } : {}),
      ...(input.graded !== undefined ? { graded: input.graded } : {}),
      ...(input.gradingCompany !== undefined ? { gradingCompany: input.gradingCompany || null } : {}),
      ...(input.grade !== undefined ? { grade: input.grade || null } : {}),
      ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice || null } : {}),
      ...(input.purchaseCurrency !== undefined ? { purchaseCurrency: input.purchaseCurrency || "CAD" } : {}),
      ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null } : {}),
      ...(input.purchaseSource !== undefined ? { purchaseSource: input.purchaseSource || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.isAutograph !== undefined ? { isAutograph: input.isAutograph } : {}),
      ...(input.subsetOrInsert !== undefined ? { subsetOrInsert: input.subsetOrInsert || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    }).where(eq(cards.id, cardId));
  });

  revalidatePath(`/cards/${cardId}`);
  revalidatePath("/cards");
  return { success: true };
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
  // Rate limit: 3 rescouts per minute
  const rl = rateLimit("rescout", 3, 60_000);
  if (!rl.success) {
    return { success: false, error: "Too many requests. Please wait a moment." };
  }

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

const PAGE_SIZE = 30;

export async function getCards(filters?: {
  search?: string;
  year?: string;
  status?: string;
  sortBy?: string;
  page?: number;
}): Promise<{ cards: CardWithDetails[]; totalCount: number; page: number; pageSize: number }> {
  const conditions = [isNull(cards.deletedAt)];

  if (filters?.status) {
    conditions.push(eq(cards.status, filters.status));
  }
  if (filters?.year) {
    const yearNum = parseInt(filters.year);
    if (!isNaN(yearNum)) {
      conditions.push(eq(cards.year, yearNum));
    }
  }
  // Server-side fuzzy search via pg_trgm similarity + ilike fallback
  if (filters?.search) {
    const term = filters.search.trim();
    if (term.length > 0) {
      const likeTerm = `%${term}%`;
      conditions.push(
        sql`(
          similarity(${players.name}, ${term}) > 0.2
          OR similarity(${sets.name}, ${term}) > 0.2
          OR ${players.name} ILIKE ${likeTerm}
          OR ${sets.name} ILIKE ${likeTerm}
          OR ${cards.cardNumber} ILIKE ${likeTerm}
        )`
      );
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort order — when searching without explicit sort, rank by relevance
  const searchTerm = filters?.search?.trim();
  let orderClause;
  switch (filters?.sortBy) {
    case "name": orderClause = players.name; break;
    case "year": orderClause = desc(cards.year); break;
    case "value": orderClause = desc(priceEstimates.estimatedValueUsd); break;
    default:
      if (searchTerm && searchTerm.length > 0) {
        // Best fuzzy match first (highest similarity score)
        orderClause = sql`GREATEST(
          similarity(${players.name}, ${searchTerm}),
          similarity(${sets.name}, ${searchTerm})
        ) DESC`;
      } else {
        orderClause = desc(cards.createdAt);
      }
  }

  const page = Math.max(1, filters?.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(whereClause);
  const totalCount = countResult?.count ?? 0;

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
      referenceCardId: cards.referenceCardId,
      aiCorrected: cards.aiCorrected,
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
    .where(whereClause)
    .orderBy(orderClause)
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    cards: rows as CardWithDetails[],
    totalCount,
    page,
    pageSize: PAGE_SIZE,
  };
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
      referenceProductName: setProducts.name,
      referenceProductYear: setProducts.year,
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
    .leftJoin(referenceCards, eq(cards.referenceCardId, referenceCards.id))
    .leftJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
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

// ── Collection Verification Stats ──

export async function getCollectionVerificationStats(): Promise<{
  total: number;
  verified: number;
  corrected: number;
  aiOnly: number;
}> {
  const [result] = await db
    .select({
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(case when ${cards.referenceCardId} is not null then 1 end)::int`,
      corrected: sql<number>`count(case when ${cards.aiCorrected} = true and ${cards.referenceCardId} is null then 1 end)::int`,
    })
    .from(cards)
    .where(isNull(cards.deletedAt));

  const total = result?.total ?? 0;
  const verified = result?.verified ?? 0;
  const corrected = result?.corrected ?? 0;

  return {
    total,
    verified,
    corrected,
    aiOnly: Math.max(0, total - verified - corrected),
  };
}

// ── Dashboard Stats ──

export async function getDashboardStats() {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(isNull(cards.deletedAt));

  const [valueResult] = await db
    .select({
      total: sql<string>`coalesce(sum(${priceEstimates.estimatedValueCad}::numeric), 0)`,
    })
    .from(priceEstimates)
    .innerJoin(cards, eq(priceEstimates.cardId, cards.id))
    .where(isNull(cards.deletedAt));

  return {
    totalCards: countResult?.count ?? 0,
    totalValue: parseFloat(valueResult?.total ?? "0"),
  };
}

// ── Delete (soft) ──

export async function deleteCard(id: string) {
  await db.update(cards).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(cards.id, id));
  revalidatePath("/cards");
  revalidatePath("/cards/deleted");
  revalidatePath("/");
}

export async function restoreCard(id: string) {
  await db.update(cards).set({ deletedAt: null, updatedAt: new Date() }).where(eq(cards.id, id));
  revalidatePath("/cards");
  revalidatePath("/cards/deleted");
  revalidatePath("/");
}

export async function permanentlyDeleteCard(id: string) {
  await db.delete(cards).where(eq(cards.id, id));
  revalidatePath("/cards/deleted");
  revalidatePath("/");
}

export async function emptyRecycleBin() {
  await db.delete(cards).where(isNotNull(cards.deletedAt));
  revalidatePath("/cards/deleted");
  revalidatePath("/");
}

export async function getDeletedCards(): Promise<Array<{
  id: string;
  playerName: string | null;
  setName: string | null;
  year: number | null;
  cardNumber: string | null;
  parallelVariant: string | null;
  deletedAt: Date;
}>> {
  const rows = await db
    .select({
      id: cards.id,
      playerName: players.name,
      setName: sets.name,
      year: cards.year,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      deletedAt: cards.deletedAt,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(isNotNull(cards.deletedAt))
    .orderBy(desc(cards.deletedAt));

  return rows as Array<{
    id: string;
    playerName: string | null;
    setName: string | null;
    year: number | null;
    cardNumber: string | null;
    parallelVariant: string | null;
    deletedAt: Date;
  }>;
}

export async function getDeletedCardCount(): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(isNotNull(cards.deletedAt));
  return result?.count ?? 0;
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

// ── Update Card Identification (override AI) ──

export async function updateCardIdentification(
  cardId: string,
  updates: {
    playerName?: string;
    setName?: string;
    year?: number;
    cardNumber?: string;
    parallelVariant?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.transaction(async (tx) => {
      // Fetch old card data + related names for correction logging
      const [oldCard] = await tx
        .select({
          playerName: players.name,
          setName: sets.name,
          year: cards.year,
          cardNumber: cards.cardNumber,
          parallelVariant: cards.parallelVariant,
          referenceCardId: cards.referenceCardId,
        })
        .from(cards)
        .leftJoin(players, eq(cards.playerId, players.id))
        .leftJoin(sets, eq(cards.setId, sets.id))
        .where(eq(cards.id, cardId))
        .limit(1);

      // Log corrections for each changed field
      const corrections: Array<{
        correctionType: string;
        fieldName: string;
        aiOriginalValue: string | null;
        userCorrectedValue: string | null;
      }> = [];

      if (updates.playerName && updates.playerName !== oldCard?.playerName) {
        corrections.push({
          correctionType: "player",
          fieldName: "playerName",
          aiOriginalValue: oldCard?.playerName ?? null,
          userCorrectedValue: updates.playerName,
        });
      }
      if (updates.setName && updates.setName !== oldCard?.setName) {
        corrections.push({
          correctionType: "set",
          fieldName: "setName",
          aiOriginalValue: oldCard?.setName ?? null,
          userCorrectedValue: updates.setName,
        });
      }
      if (updates.year !== undefined && updates.year !== oldCard?.year) {
        corrections.push({
          correctionType: "year",
          fieldName: "year",
          aiOriginalValue: oldCard?.year?.toString() ?? null,
          userCorrectedValue: updates.year?.toString() ?? null,
        });
      }
      if (updates.cardNumber !== undefined && updates.cardNumber !== oldCard?.cardNumber) {
        corrections.push({
          correctionType: "cardNumber",
          fieldName: "cardNumber",
          aiOriginalValue: oldCard?.cardNumber ?? null,
          userCorrectedValue: updates.cardNumber ?? null,
        });
      }
      if (updates.parallelVariant !== undefined && updates.parallelVariant !== oldCard?.parallelVariant) {
        corrections.push({
          correctionType: "parallel",
          fieldName: "parallelVariant",
          aiOriginalValue: oldCard?.parallelVariant ?? null,
          userCorrectedValue: updates.parallelVariant ?? null,
        });
      }

      // Insert correction log entries
      if (corrections.length > 0) {
        const correctionType = corrections.length > 1 ? "multiple" : corrections[0].correctionType;
        for (const c of corrections) {
          await tx.insert(correctionLog).values({
            cardId,
            correctionType: corrections.length > 1 ? "multiple" : c.correctionType,
            fieldName: c.fieldName,
            aiOriginalValue: c.aiOriginalValue,
            userCorrectedValue: c.userCorrectedValue,
          });
        }
      }

      // Find or create player
      if (updates.playerName) {
        const existing = await tx
          .select()
          .from(players)
          .where(ilike(players.name, updates.playerName))
          .limit(1);

        let playerId: string;
        if (existing.length > 0) {
          playerId = existing[0].id;
        } else {
          const [newPlayer] = await tx
            .insert(players)
            .values({ name: updates.playerName })
            .returning();
          playerId = newPlayer.id;
        }
        await tx.update(cards).set({ playerId }).where(eq(cards.id, cardId));
      }

      // Find or create set
      if (updates.setName && updates.year) {
        const existing = await tx
          .select()
          .from(sets)
          .where(and(ilike(sets.name, updates.setName), eq(sets.year, updates.year)))
          .limit(1);

        let setId: string;
        if (existing.length > 0) {
          setId = existing[0].id;
        } else {
          const [newSet] = await tx
            .insert(sets)
            .values({ name: updates.setName, year: updates.year })
            .returning();
          setId = newSet.id;
        }
        await tx.update(cards).set({ setId }).where(eq(cards.id, cardId));
      }

      // Update card fields + mark as corrected
      await tx
        .update(cards)
        .set({
          ...(updates.year !== undefined ? { year: updates.year } : {}),
          ...(updates.cardNumber !== undefined ? { cardNumber: updates.cardNumber || null } : {}),
          ...(updates.parallelVariant !== undefined ? { parallelVariant: updates.parallelVariant || null } : {}),
          aiCorrected: true,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, cardId));
    });

    // Re-trigger pricing with corrected identity
    await rescoutCard(cardId);

    revalidatePath(`/cards/${cardId}`);
    revalidatePath("/cards");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("[updateCardIdentification] Error:", err);
    return { success: false, error: String(err) };
  }
}

// ── Bulk Operations ──

export async function bulkUpdateStatus(cardIds: string[], status: string): Promise<{ success: boolean; count: number }> {
  if (cardIds.length === 0) return { success: true, count: 0 };

  const validStatuses = ["in_collection", "for_sale", "sold", "traded"];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  await db
    .update(cards)
    .set({ status, updatedAt: new Date() })
    .where(inArray(cards.id, cardIds));

  revalidatePath("/cards");
  revalidatePath("/");
  return { success: true, count: cardIds.length };
}

export async function bulkDelete(cardIds: string[]): Promise<{ success: boolean; count: number }> {
  if (cardIds.length === 0) return { success: true, count: 0 };

  await db
    .update(cards)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(cards.id, cardIds));

  revalidatePath("/cards");
  revalidatePath("/cards/deleted");
  revalidatePath("/");
  return { success: true, count: cardIds.length };
}

export async function bulkExport(cardIds: string[]): Promise<string> {
  if (cardIds.length === 0) return "";

  const rows = await db
    .select({
      playerName: players.name,
      playerTeam: players.team,
      year: cards.year,
      setName: sets.name,
      manufacturer: manufacturers.name,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      isRookieCard: cards.isRookieCard,
      isAutograph: cards.isAutograph,
      condition: cards.condition,
      graded: cards.graded,
      gradingCompany: cards.gradingCompany,
      grade: cards.grade,
      status: cards.status,
      purchasePrice: cards.purchasePrice,
      purchaseCurrency: cards.purchaseCurrency,
      purchaseDate: cards.purchaseDate,
      purchaseSource: cards.purchaseSource,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      notes: cards.notes,
      createdAt: cards.createdAt,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(inArray(cards.id, cardIds))
    .orderBy(desc(cards.createdAt));

  function esc(val: string | null | undefined): string {
    if (!val) return "";
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  const headers = [
    "Player", "Team", "Year", "Set", "Manufacturer", "Card #", "Parallel",
    "Rookie", "Auto", "Condition", "Graded", "Grading Co", "Grade",
    "Status", "Purchase Price", "Currency", "Purchase Date", "Source",
    "Est Value USD", "Est Value CAD", "Notes", "Date Added",
  ];

  const csvRows = rows.map(r => [
    esc(r.playerName),
    esc(r.playerTeam),
    r.year ?? "",
    esc(r.setName),
    esc(r.manufacturer),
    esc(r.cardNumber),
    esc(r.parallelVariant),
    r.isRookieCard ? "Yes" : "No",
    r.isAutograph ? "Yes" : "No",
    esc(r.condition),
    r.graded ? "Yes" : "No",
    esc(r.gradingCompany),
    esc(r.grade),
    r.status ?? "in_collection",
    r.purchasePrice ?? "",
    r.purchaseCurrency ?? "CAD",
    r.purchaseDate ? new Date(r.purchaseDate).toISOString().slice(0, 10) : "",
    esc(r.purchaseSource),
    r.estimatedValueUsd ?? "",
    r.estimatedValueCad ?? "",
    esc(r.notes),
    r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
  ]);

  return [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
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
