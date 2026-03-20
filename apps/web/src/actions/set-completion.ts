"use server";

import { db, cards, sets, manufacturers, players } from "@holdsworth/db";
import { eq, desc, sql, and, count } from "drizzle-orm";

/**
 * B-009: Set Completion Tracker
 *
 * Auto-detect which sets the user has cards from and show progress.
 */

export interface SetCompletionData {
  setId: string;
  setName: string;
  year: number;
  manufacturer: string | null;
  ownedCount: number;
  estimatedTotal: number | null; // From reference data, if available
  completionPct: number | null;
  cards: Array<{
    id: string;
    playerName: string;
    cardNumber: string | null;
  }>;
}

// Common set sizes for popular products (when reference data isn't available)
const KNOWN_SET_SIZES: Record<string, number> = {
  "topps series 1": 330,
  "topps series 2": 330,
  "topps update": 330,
  "topps chrome": 220,
  "topps chrome update": 100,
  "topps heritage": 500,
  "bowman": 200,
  "bowman chrome": 150,
  "bowman draft": 200,
  "panini prizm": 300,
  "panini donruss": 262,
  "topps allen & ginter": 350,
  "topps gypsy queen": 300,
  "topps stadium club": 300,
  "topps archives": 300,
  "topps inception": 100,
  "topps tier one": 50,
  "topps museum collection": 100,
  "topps tribute": 100,
  "topps big league": 300,
  "topps opening day": 200,
  "topps gallery": 200,
  "topps fire": 200,
  "topps holiday": 200,
};

function estimateSetSize(setName: string): number | null {
  const lower = setName.toLowerCase();
  for (const [key, size] of Object.entries(KNOWN_SET_SIZES)) {
    if (lower.includes(key)) return size;
  }
  return null;
}

export async function getSetCompletions(): Promise<SetCompletionData[]> {
  // Get all sets the user has cards from, with count
  const setStats = await db
    .select({
      setId: sets.id,
      setName: sets.name,
      year: sets.year,
      manufacturer: manufacturers.name,
      ownedCount: sql<number>`count(${cards.id})::int`,
    })
    .from(cards)
    .innerJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .where(sql`${cards.status} != 'sold'`)
    .groupBy(sets.id, sets.name, sets.year, manufacturers.name)
    .orderBy(desc(sql`count(${cards.id})`))
    .limit(20);

  // For each set, get the individual cards
  const results: SetCompletionData[] = [];

  for (const stat of setStats) {
    // Get card details for this set
    const setCards = await db
      .select({
        id: cards.id,
        playerName: players.name,
        cardNumber: cards.cardNumber,
      })
      .from(cards)
      .leftJoin(players, eq(cards.playerId, players.id))
      .where(and(eq(cards.setId, stat.setId), sql`${cards.status} != 'sold'`))
      .orderBy(cards.cardNumber);

    const estimatedTotal = estimateSetSize(stat.setName);
    const completionPct = estimatedTotal
      ? Math.min(100, Math.round((stat.ownedCount / estimatedTotal) * 100))
      : null;

    results.push({
      setId: stat.setId,
      setName: stat.setName,
      year: stat.year,
      manufacturer: stat.manufacturer ?? null,
      ownedCount: stat.ownedCount,
      estimatedTotal,
      completionPct,
      cards: setCards.map((c) => ({
        id: c.id,
        playerName: c.playerName ?? "Unknown",
        cardNumber: c.cardNumber ?? null,
      })),
    });
  }

  return results;
}
