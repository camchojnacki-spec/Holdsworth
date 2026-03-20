import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const playerCanonical = pgTable(
  "player_canonical",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: varchar("canonical_name", { length: 255 }).notNull(),
    aliases: text("aliases").array(),
    sport: varchar("sport", { length: 50 }).default("baseball"),
    position: varchar("position", { length: 50 }),
    team: varchar("team", { length: 100 }),
    marketTier: varchar("market_tier", { length: 20 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("player_canonical_name_idx").on(table.canonicalName),
    index("player_canonical_team_idx").on(table.team),
  ]
);
