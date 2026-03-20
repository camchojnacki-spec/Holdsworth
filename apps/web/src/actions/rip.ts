"use server";

import { db, ripSessions, ripCards, cards, players, sets, manufacturers, cardPhotos, enqueuePriceLookup } from "@holdsworth/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { scanCardWithGemini, detectCardBounds, type CardScanResponse, type CardCropRegion } from "@/lib/ai/gemini";
import { uploadCardPhoto } from "@/lib/gcs";
import { ilike } from "drizzle-orm";

// ── Session Management ──

export async function createRipSession(name?: string) {
  const [session] = await db
    .insert(ripSessions)
    .values({ name: name || `Pack Rip · ${new Date().toLocaleDateString()}` })
    .returning();
  return session;
}

export async function getRipSessions() {
  return db
    .select()
    .from(ripSessions)
    .orderBy(desc(ripSessions.createdAt))
    .limit(20);
}

export async function getRipSession(sessionId: string) {
  const [session] = await db
    .select()
    .from(ripSessions)
    .where(eq(ripSessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  const sessionCards = await db
    .select()
    .from(ripCards)
    .where(eq(ripCards.sessionId, sessionId))
    .orderBy(ripCards.sortOrder);

  return { session, cards: sessionCards };
}

// ── Scan a card into a rip session ──

export async function ripScanCard(
  sessionId: string,
  formData: FormData
): Promise<{ success: boolean; cardId?: string; error?: string }> {
  try {
    const frontFile = formData.get("image") as File;
    if (!frontFile || frontFile.size === 0) {
      return { success: false, error: "No image provided" };
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    const frontType = validTypes.includes(frontFile.type) ? frontFile.type : "image/jpeg";
    const frontBuffer = await frontFile.arrayBuffer();
    const frontBase64 = Buffer.from(frontBuffer).toString("base64");

    let backBase64: string | undefined;
    let backMimeType: string | undefined;
    const backFile = formData.get("backImage") as File | null;
    if (backFile && backFile.size > 0) {
      const backBuffer = await backFile.arrayBuffer();
      backBase64 = Buffer.from(backBuffer).toString("base64");
      backMimeType = validTypes.includes(backFile.type) ? backFile.type : "image/jpeg";
    }

    // Run scan + bounds in parallel
    const [aiResult, bounds] = await Promise.all([
      scanCardWithGemini(frontBase64, frontType, backBase64, backMimeType),
      detectCardBounds(frontBase64, frontType),
    ]);

    // Get current card count for sort order
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ripCards)
      .where(eq(ripCards.sessionId, sessionId));

    // Store as data URL for the rip card
    const frontDataUrl = `data:${frontType};base64,${frontBase64}`;
    const backDataUrl = backBase64 ? `data:${backMimeType};base64,${backBase64}` : null;

    const [ripCard] = await db
      .insert(ripCards)
      .values({
        sessionId,
        sortOrder: (countResult?.count ?? 0) + 1,
        aiResult: aiResult as unknown as Record<string, unknown>,
        frontPhotoUrl: frontDataUrl,
        backPhotoUrl: backDataUrl,
        confidence: Math.round((aiResult.confidence ?? 0) * 100),
        status: "pending",
      })
      .returning();

    // Update session card count
    await db
      .update(ripSessions)
      .set({
        cardCount: sql`${ripSessions.cardCount} + 1`,
      })
      .where(eq(ripSessions.id, sessionId));

    revalidatePath(`/scan/rip/${sessionId}`);
    return { success: true, cardId: ripCard.id };
  } catch (err) {
    console.error("[ripScan] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Scan failed" };
  }
}

// ── Review & Catalogue ──

export async function updateRipCard(
  ripCardId: string,
  edits: Record<string, string>
) {
  await db
    .update(ripCards)
    .set({
      userEdits: edits,
      reviewed: true,
      status: "reviewed",
    })
    .where(eq(ripCards.id, ripCardId));
}

export async function catalogueRipCard(ripCardId: string) {
  const [ripCard] = await db
    .select()
    .from(ripCards)
    .where(eq(ripCards.id, ripCardId))
    .limit(1);

  if (!ripCard || ripCard.status === "catalogued") return { success: false };

  const ai = ripCard.aiResult as unknown as CardScanResponse;
  const edits = (ripCard.userEdits as Record<string, string>) ?? {};

  const playerName = edits.player_name || ai.player_name;
  const year = parseInt(edits.year || String(ai.year)) || ai.year;
  const setName = edits.set_name || ai.set_name;
  const manufacturer = edits.manufacturer || ai.manufacturer;

  // Create card (simplified version of createCard)
  const card = await db.transaction(async (tx) => {
    // Find or create player
    let playerId: string | undefined;
    if (playerName) {
      const existing = await tx.select().from(players).where(ilike(players.name, playerName)).limit(1);
      if (existing.length > 0) {
        playerId = existing[0].id;
      } else {
        const [newPlayer] = await tx.insert(players).values({ name: playerName }).returning();
        playerId = newPlayer.id;
      }
    }

    // Find or create manufacturer
    let manufacturerId: string | undefined;
    if (manufacturer) {
      const existing = await tx.select().from(manufacturers).where(ilike(manufacturers.name, manufacturer)).limit(1);
      if (existing.length > 0) {
        manufacturerId = existing[0].id;
      } else {
        const [newMfg] = await tx.insert(manufacturers).values({ name: manufacturer }).returning();
        manufacturerId = newMfg.id;
      }
    }

    // Find or create set
    let setId: string | undefined;
    if (setName && year) {
      const existing = await tx.select().from(sets).where(and(ilike(sets.name, setName), eq(sets.year, year))).limit(1);
      if (existing.length > 0) {
        setId = existing[0].id;
      } else {
        const [newSet] = await tx.insert(sets).values({ name: setName, year, manufacturerId: manufacturerId ?? null }).returning();
        setId = newSet.id;
      }
    }

    const [newCard] = await tx
      .insert(cards)
      .values({
        playerId: playerId ?? null,
        setId: setId ?? null,
        cardNumber: edits.card_number || ai.card_number || null,
        year: year ?? null,
        parallelVariant: edits.parallel_variant || ai.parallel_variant || null,
        isRookieCard: ai.is_rookie_card ?? false,
        condition: ai.condition_estimate || null,
        conditionNotes: ai.condition_notes || null,
        graded: ai.graded ?? false,
        gradingCompany: ai.grading_company ?? null,
        grade: ai.grade ?? null,
        quantity: 1,
        purchaseCurrency: "CAD",
        aiRawResponse: ai as unknown as Record<string, unknown>,
        subsetOrInsert: ai.subset_or_insert ?? null,
        isAutograph: ai.is_autograph ?? false,
        isRelic: ai.is_relic ?? false,
        status: "in_collection",
      })
      .returning();

    // Upload front photo (with optimized variants)
    if (ripCard.frontPhotoUrl) {
      let photoUrl = ripCard.frontPhotoUrl;
      let displayUrl: string | null = null;
      let thumbnailUrl: string | null = null;
      if (photoUrl.startsWith("data:")) {
        try {
          const result = await uploadCardPhoto(photoUrl, newCard.id, "front");
          photoUrl = result.url;
          displayUrl = result.displayUrl;
          thumbnailUrl = result.thumbnailUrl;
        } catch {
          // Keep data URL as fallback
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

    if (ripCard.backPhotoUrl) {
      let backUrl = ripCard.backPhotoUrl;
      let backDisplayUrl: string | null = null;
      let backThumbnailUrl: string | null = null;
      if (backUrl.startsWith("data:")) {
        try {
          const result = await uploadCardPhoto(backUrl, newCard.id, "back");
          backUrl = result.url;
          backDisplayUrl = result.displayUrl;
          backThumbnailUrl = result.thumbnailUrl;
        } catch {
          // Keep data URL
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

  // Mark rip card as catalogued
  await db
    .update(ripCards)
    .set({ status: "catalogued", cataloguedCardId: card.id })
    .where(eq(ripCards.id, ripCardId));

  // Update session reviewed count
  await db
    .update(ripSessions)
    .set({ reviewedCount: sql`${ripSessions.reviewedCount} + 1` })
    .where(eq(ripSessions.id, ripCard.sessionId));

  // Enqueue pricing
  await enqueuePriceLookup(card.id, {
    playerName,
    year,
    setName,
    manufacturer,
    cardNumber: edits.card_number || ai.card_number || undefined,
    parallelVariant: edits.parallel_variant || ai.parallel_variant || undefined,
    isAutograph: ai.is_autograph ?? undefined,
    subsetOrInsert: ai.subset_or_insert ?? undefined,
    graded: ai.graded ?? undefined,
    gradingCompany: ai.grading_company ?? undefined,
    grade: ai.grade ?? undefined,
  });

  revalidatePath("/cards");
  revalidatePath("/");
  return { success: true, cardId: card.id };
}

export async function catalogueAllRipCards(sessionId: string) {
  const pendingCards = await db
    .select()
    .from(ripCards)
    .where(and(eq(ripCards.sessionId, sessionId), eq(ripCards.status, "pending")));

  const reviewedCards = await db
    .select()
    .from(ripCards)
    .where(and(eq(ripCards.sessionId, sessionId), eq(ripCards.status, "reviewed")));

  const toCatalogue = [...reviewedCards, ...pendingCards];
  let catalogued = 0;

  for (const card of toCatalogue) {
    try {
      await catalogueRipCard(card.id);
      catalogued++;
    } catch (err) {
      console.error(`[rip] Failed to catalogue card ${card.id}:`, err);
    }
  }

  // Mark session complete
  await db
    .update(ripSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(ripSessions.id, sessionId));

  revalidatePath(`/scan/rip/${sessionId}`);
  revalidatePath("/cards");
  return { catalogued, total: toCatalogue.length };
}
