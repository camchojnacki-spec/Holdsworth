/**
 * B-013: Enable pg_trgm extension and add GIN trigram indexes for fuzzy search.
 *
 * Run once against the database (already applied):
 *
 *   CREATE EXTENSION IF NOT EXISTS pg_trgm;
 *   CREATE INDEX IF NOT EXISTS idx_players_name_trgm ON players USING gin (name gin_trgm_ops);
 *   CREATE INDEX IF NOT EXISTS idx_sets_name_trgm ON sets USING gin (name gin_trgm_ops);
 *   CREATE INDEX IF NOT EXISTS idx_cards_card_number_trgm ON cards USING gin (card_number gin_trgm_ops);
 *
 * These indexes accelerate similarity() and ILIKE queries on player name,
 * set name, and card number columns.
 */

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export async function applyTrgmMigration(db: NodePgDatabase) {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_players_name_trgm ON players USING gin (name gin_trgm_ops)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_sets_name_trgm ON sets USING gin (name gin_trgm_ops)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_cards_card_number_trgm ON cards USING gin (card_number gin_trgm_ops)`
  );
}
