import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { manufacturers } from "./manufacturers";

// ── Set Products ──
// A "product" is what you buy at the store: "2025 Topps Series 1", "2025 Bowman Chrome"
export const setProducts = pgTable(
  "set_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    name: varchar("name", { length: 255 }).notNull(), // "Topps Series 1"
    year: integer("year").notNull(),
    sport: varchar("sport", { length: 100 }).default("baseball"),
    releaseDate: date("release_date"),
    baseSetSize: integer("base_set_size"),
    sourceUrl: varchar("source_url", { length: 1000 }),
    lastScrapedAt: timestamp("last_scraped_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("set_products_year_idx").on(table.year),
    unique("set_products_name_year_idx").on(table.name, table.year),
  ]
);

// ── Subsets ──
// Insert sets within a product: "1990 Topps Baseball Autographs", "Future Stars"
export const subsets = pgTable(
  "subsets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id)
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    subsetType: varchar("subset_type", { length: 50 }).notNull(), // "base", "insert", "autograph", "relic"
    numberingPattern: varchar("numbering_pattern", { length: 100 }), // "90A-*" pattern
    totalCards: integer("total_cards"),
    isAutograph: boolean("is_autograph").default(false),
    isRelic: boolean("is_relic").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("subsets_set_product_idx").on(table.setProductId),
  ]
);

// ── Reference Cards ──
// Every known card in every known set — the master checklist
export const referenceCards = pgTable(
  "reference_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id)
      .notNull(),
    subsetId: uuid("subset_id").references(() => subsets.id),
    cardNumber: varchar("card_number", { length: 50 }).notNull(),
    playerName: varchar("player_name", { length: 255 }).notNull(),
    team: varchar("team", { length: 255 }),
    isRookieCard: boolean("is_rookie_card").default(false),
    isAutograph: boolean("is_autograph").default(false),
    isRelic: boolean("is_relic").default(false),
    isShortPrint: boolean("is_short_print").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("ref_cards_product_number_idx").on(table.setProductId, table.cardNumber),
    index("ref_cards_card_number_idx").on(table.cardNumber),
    index("ref_cards_player_idx").on(table.playerName),
  ]
);

// ── Parallel Types ──
// Different colored/numbered versions of cards
export const parallelTypes = pgTable(
  "parallel_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id)
      .notNull(),
    subsetId: uuid("subset_id").references(() => subsets.id),
    name: varchar("name", { length: 255 }).notNull(), // "Gold /2025"
    printRun: integer("print_run"), // 2025, 75, 1 etc.
    serialNumbered: boolean("serial_numbered").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("parallel_types_set_product_idx").on(table.setProductId),
  ]
);
