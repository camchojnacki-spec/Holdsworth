import {
  pgTable,
  uuid,
  numeric,
  integer,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * B-007: Portfolio time-series — daily value snapshots.
 *
 * One row per day tracking total portfolio value.
 * Used to render a value-over-time chart on the Portfolio page.
 */
export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotDate: date("snapshot_date").notNull(),
    totalValueUsd: numeric("total_value_usd", { precision: 12, scale: 2 }).default("0").notNull(),
    totalValueCad: numeric("total_value_cad", { precision: 12, scale: 2 }).default("0").notNull(),
    totalCostCad: numeric("total_cost_cad", { precision: 12, scale: 2 }).default("0").notNull(),
    cardCount: integer("card_count").default(0).notNull(),
    pricedCount: integer("priced_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("portfolio_snapshots_date_idx").on(table.snapshotDate),
  ]
);
