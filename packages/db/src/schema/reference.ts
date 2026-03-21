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
  text,
  numeric,
  jsonb,
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
    subsetType: varchar("subset_type", { length: 50 }).notNull(), // "base", "insert", "parallel", "auto", "relic", "sp"
    numberingPattern: varchar("numbering_pattern", { length: 100 }), // "T89-*" pattern
    baseSetSize: integer("base_set_size"), // how many cards in this subset
    totalCards: integer("total_cards"),
    isNumbered: boolean("is_numbered").default(false),
    printRun: integer("print_run"),
    isAutograph: boolean("is_autograph").default(false),
    isRelic: boolean("is_relic").default(false),
    oddsPerPack: varchar("odds_per_pack", { length: 50 }), // e.g. "1:4", "1:24"
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
    position: varchar("position", { length: 50 }),
    jerseyNumber: varchar("jersey_number", { length: 10 }),
    printRun: integer("print_run"),
    imageVariation: boolean("image_variation").default(false),
    notes: text("notes"),
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
    colorFamily: varchar("color_family", { length: 50 }),
    finishType: varchar("finish_type", { length: 50 }),
    exclusiveTo: varchar("exclusive_to", { length: 100 }),
    priceMultiplier: numeric("price_multiplier", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("parallel_types_set_product_idx").on(table.setProductId),
  ]
);

// ── Parallel Market Data ──
// Dynamic price multipliers computed from actual market sales data
export const parallelMarketData = pgTable(
  "parallel_market_data",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parallelTypeId: uuid("parallel_type_id")
      .references(() => parallelTypes.id, { onDelete: "cascade" })
      .notNull(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id, { onDelete: "cascade" })
      .notNull(),
    computedMultiplier: numeric("computed_multiplier", { precision: 8, scale: 3 }),
    avgPriceUsd: numeric("avg_price_usd", { precision: 10, scale: 2 }),
    basePriceUsd: numeric("base_price_usd", { precision: 10, scale: 2 }),
    sampleSize: integer("sample_size").default(0),
    lastComputedAt: timestamp("last_computed_at").defaultNow().notNull(),
    priceRange: jsonb("price_range"), // { min, max, median }
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("parallel_market_data_parallel_type_idx").on(table.parallelTypeId),
    index("parallel_market_data_set_product_idx").on(table.setProductId),
    unique("parallel_market_data_type_set_idx").on(table.parallelTypeId, table.setProductId),
  ]
);

// ── Set Import Attempts ──
// Tracks TCDB import attempts to prevent redundant retries
export const setImportAttempts = pgTable(
  "set_import_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setName: varchar("set_name", { length: 255 }).notNull(),
    year: integer("year").notNull(),
    manufacturer: varchar("manufacturer", { length: 255 }),
    tcdbUrl: varchar("tcdb_url", { length: 1000 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // imported, not_found, parse_error, pending
    attemptsCount: integer("attempts_count").default(1),
    lastAttempted: timestamp("last_attempted").defaultNow().notNull(),
    errorMessage: text("error_message"),
    triggerCardId: uuid("trigger_card_id"), // card that triggered the import attempt
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("set_import_attempts_name_year_idx").on(table.setName, table.year),
    index("set_import_attempts_status_idx").on(table.status),
  ]
);

// ── Subset Market Data ──
// Aggregate pricing data for insert sets (computed from actual sales)
export const subsetMarketData = pgTable(
  "subset_market_data",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subsetId: uuid("subset_id")
      .references(() => subsets.id, { onDelete: "cascade" })
      .notNull(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id, { onDelete: "cascade" })
      .notNull(),
    avgBasePriceUsd: numeric("avg_base_price_usd", { precision: 10, scale: 2 }),
    medianBasePriceUsd: numeric("median_base_price_usd", { precision: 10, scale: 2 }),
    priceFloorUsd: numeric("price_floor_usd", { precision: 10, scale: 2 }),
    priceCeilingUsd: numeric("price_ceiling_usd", { precision: 10, scale: 2 }),
    insertVsBaseMultiplier: numeric("insert_vs_base_multiplier", { precision: 8, scale: 3 }),
    sampleSize: integer("sample_size").default(0),
    lastComputedAt: timestamp("last_computed_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("subset_market_data_subset_set_idx").on(table.subsetId, table.setProductId),
    index("subset_market_data_set_product_idx").on(table.setProductId),
  ]
);
