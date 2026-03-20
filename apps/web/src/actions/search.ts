"use server";

import { db, setProducts, players, parallelTypes } from "@holdsworth/db";
import { ilike, eq, sql } from "drizzle-orm";

export async function searchSetProducts(
  query: string
): Promise<Array<{ id: string; name: string; year: number }>> {
  if (!query || query.trim().length < 2) return [];

  const term = `%${query.trim()}%`;
  const rows = await db
    .select({
      id: setProducts.id,
      name: setProducts.name,
      year: setProducts.year,
    })
    .from(setProducts)
    .where(ilike(setProducts.name, term))
    .orderBy(sql`${setProducts.year} DESC, ${setProducts.name} ASC`)
    .limit(10);

  return rows;
}

export async function searchPlayers(
  query: string
): Promise<Array<{ id: string; name: string; team: string | null }>> {
  if (!query || query.trim().length < 2) return [];

  const term = `%${query.trim()}%`;
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      team: players.team,
    })
    .from(players)
    .where(ilike(players.name, term))
    .orderBy(players.name)
    .limit(10);

  return rows;
}

export async function getParallelsForSet(
  setProductId: string
): Promise<Array<{ id: string; name: string; printRun: number | null }>> {
  if (!setProductId) return [];

  const rows = await db
    .select({
      id: parallelTypes.id,
      name: parallelTypes.name,
      printRun: parallelTypes.printRun,
    })
    .from(parallelTypes)
    .where(eq(parallelTypes.setProductId, setProductId))
    .orderBy(parallelTypes.name);

  return rows;
}
