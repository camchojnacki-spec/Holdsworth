"use server";

import { db, priceAlerts, cards, players, sets, priceEstimates } from "@holdsworth/db";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ── Types ──

export interface PriceAlertWithCard {
  id: string;
  cardId: string;
  alertType: string;
  thresholdValue: string;
  thresholdCurrency: string;
  active: boolean;
  triggered: boolean;
  triggeredAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  playerName: string | null;
  year: number | null;
  setName: string | null;
  cardNumber: string | null;
  estimatedValueCad: string | null;
  estimatedValueUsd: string | null;
}

// ── Create ──

export async function createPriceAlert(
  cardId: string,
  alertType: string,
  thresholdValue: number,
  currency: string = "CAD"
): Promise<{ id: string }> {
  if (!["above", "below", "change_pct"].includes(alertType)) {
    throw new Error("Invalid alert type");
  }
  if (thresholdValue <= 0) {
    throw new Error("Threshold must be a positive number");
  }

  const [alert] = await db
    .insert(priceAlerts)
    .values({
      cardId,
      alertType,
      thresholdValue: String(thresholdValue),
      thresholdCurrency: currency,
    })
    .returning();

  revalidatePath("/prices/alerts");
  return { id: alert.id };
}

// ── Read ──

export async function getPriceAlerts(): Promise<PriceAlertWithCard[]> {
  const rows = await db
    .select({
      id: priceAlerts.id,
      cardId: priceAlerts.cardId,
      alertType: priceAlerts.alertType,
      thresholdValue: priceAlerts.thresholdValue,
      thresholdCurrency: priceAlerts.thresholdCurrency,
      active: priceAlerts.active,
      triggered: priceAlerts.triggered,
      triggeredAt: priceAlerts.triggeredAt,
      lastCheckedAt: priceAlerts.lastCheckedAt,
      createdAt: priceAlerts.createdAt,
      playerName: players.name,
      year: cards.year,
      setName: sets.name,
      cardNumber: cards.cardNumber,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
    })
    .from(priceAlerts)
    .innerJoin(cards, eq(priceAlerts.cardId, cards.id))
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .orderBy(desc(priceAlerts.createdAt));

  return rows;
}

// ── Delete ──

export async function deletePriceAlert(alertId: string): Promise<{ success: boolean }> {
  await db.delete(priceAlerts).where(eq(priceAlerts.id, alertId));
  revalidatePath("/prices/alerts");
  return { success: true };
}

// ── Toggle ──

export async function togglePriceAlert(alertId: string): Promise<{ success: boolean }> {
  const [existing] = await db
    .select({ active: priceAlerts.active })
    .from(priceAlerts)
    .where(eq(priceAlerts.id, alertId))
    .limit(1);

  if (!existing) throw new Error("Alert not found");

  await db
    .update(priceAlerts)
    .set({
      active: !existing.active,
      // If reactivating a triggered alert, reset triggered state
      ...((!existing.active) ? { triggered: false, triggeredAt: null } : {}),
    })
    .where(eq(priceAlerts.id, alertId));

  revalidatePath("/prices/alerts");
  return { success: true };
}

// ── Check Alerts ──

export async function checkAlerts(): Promise<{ checked: number; triggered: number }> {
  // Get all active, non-triggered alerts with their current prices
  const activeAlerts = await db
    .select({
      id: priceAlerts.id,
      alertType: priceAlerts.alertType,
      thresholdValue: priceAlerts.thresholdValue,
      thresholdCurrency: priceAlerts.thresholdCurrency,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
      trendPercentage: priceEstimates.trendPercentage,
    })
    .from(priceAlerts)
    .innerJoin(cards, eq(priceAlerts.cardId, cards.id))
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(and(eq(priceAlerts.active, true), eq(priceAlerts.triggered, false)));

  let triggeredCount = 0;
  const now = new Date();

  for (const alert of activeAlerts) {
    const threshold = parseFloat(alert.thresholdValue);
    const currentValue = alert.thresholdCurrency === "USD"
      ? parseFloat(alert.estimatedValueUsd ?? "0")
      : parseFloat(alert.estimatedValueCad ?? "0");

    let shouldTrigger = false;

    switch (alert.alertType) {
      case "above":
        shouldTrigger = currentValue >= threshold;
        break;
      case "below":
        shouldTrigger = currentValue > 0 && currentValue <= threshold;
        break;
      case "change_pct": {
        const pctChange = Math.abs(parseFloat(alert.trendPercentage ?? "0"));
        shouldTrigger = pctChange >= threshold;
        break;
      }
    }

    // Update lastCheckedAt for all, trigger if threshold crossed
    if (shouldTrigger) {
      await db
        .update(priceAlerts)
        .set({ triggered: true, triggeredAt: now, lastCheckedAt: now })
        .where(eq(priceAlerts.id, alert.id));
      triggeredCount++;
    } else {
      await db
        .update(priceAlerts)
        .set({ lastCheckedAt: now })
        .where(eq(priceAlerts.id, alert.id));
    }
  }

  revalidatePath("/prices/alerts");
  return { checked: activeAlerts.length, triggered: triggeredCount };
}

// ── Get Card Label by ID ──

export async function getCardLabelById(cardId: string): Promise<string | null> {
  const [row] = await db
    .select({
      playerName: players.name,
      year: cards.year,
      setName: sets.name,
      cardNumber: cards.cardNumber,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!row) return null;
  return [row.playerName, row.year, row.setName, row.cardNumber ? `#${row.cardNumber}` : null]
    .filter(Boolean)
    .join(" \u00B7 ");
}

// ── Search Cards (for alert creation form) ──

export async function searchCardsForAlert(query: string): Promise<Array<{
  id: string;
  label: string;
}>> {
  if (!query || query.trim().length < 2) return [];

  const likeTerm = `%${query.trim()}%`;
  const rows = await db
    .select({
      id: cards.id,
      playerName: players.name,
      year: cards.year,
      setName: sets.name,
      cardNumber: cards.cardNumber,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .where(
      sql`(
        ${players.name} ILIKE ${likeTerm}
        OR ${sets.name} ILIKE ${likeTerm}
        OR ${cards.cardNumber} ILIKE ${likeTerm}
      )`
    )
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    label: [r.playerName, r.year, r.setName, r.cardNumber ? `#${r.cardNumber}` : null]
      .filter(Boolean)
      .join(" · "),
  }));
}
