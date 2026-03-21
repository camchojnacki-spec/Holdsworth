import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";
import { referenceCards, parallelTypes, setProducts } from "./reference";

export const priceSources = pgTable("price_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  baseUrl: varchar("base_url", { length: 500 }),
  scraperType: varchar("scraper_type", { length: 50 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    sourceId: uuid("source_id")
      .references(() => priceSources.id)
      .notNull(),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    priceCad: numeric("price_cad", { precision: 10, scale: 2 }),
    currencyRate: numeric("currency_rate", { precision: 10, scale: 6 }),
    saleDate: timestamp("sale_date"),
    listingUrl: varchar("listing_url", { length: 1000 }),
    listingTitle: varchar("listing_title", { length: 500 }),
    matchScore: integer("match_score"),
    condition: varchar("condition", { length: 50 }),
    graded: boolean("graded").default(false),
    grade: varchar("grade", { length: 20 }),
    // Reference DB FKs for direct aggregation (no string matching)
    referenceCardId: uuid("reference_card_id").references(() => referenceCards.id),
    parallelTypeId: uuid("parallel_type_id").references(() => parallelTypes.id),
    setProductId: uuid("set_product_id").references(() => setProducts.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("price_history_card_source_idx").on(table.cardId, table.sourceId, table.saleDate),
    index("price_history_sale_date_idx").on(table.saleDate),
    index("idx_ph_ref_card").on(table.referenceCardId),
    index("idx_ph_parallel").on(table.parallelTypeId),
    index("idx_ph_set_product").on(table.setProductId),
  ]
);

export const priceEstimates = pgTable("price_estimates", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .references(() => cards.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  estimatedValueUsd: numeric("estimated_value_usd", { precision: 10, scale: 2 }),
  estimatedValueCad: numeric("estimated_value_cad", { precision: 10, scale: 2 }),
  confidence: varchar("confidence", { length: 20 }).default("low"),
  sampleSize: integer("sample_size").default(0),
  priceTrend: varchar("price_trend", { length: 20 }).default("stable"),
  trendPercentage: numeric("trend_percentage", { precision: 6, scale: 2 }),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});
