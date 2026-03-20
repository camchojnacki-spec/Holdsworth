import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    alertType: varchar("alert_type", { length: 20 }).notNull(), // "above" | "below" | "change_pct"
    thresholdValue: numeric("threshold_value", { precision: 10, scale: 2 }).notNull(),
    thresholdCurrency: varchar("threshold_currency", { length: 3 }).default("CAD").notNull(),
    active: boolean("active").default(true).notNull(),
    triggered: boolean("triggered").default(false).notNull(),
    triggeredAt: timestamp("triggered_at"),
    lastTriggeredAt: timestamp("last_triggered_at"),
    lastCheckedAt: timestamp("last_checked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("price_alerts_card_idx").on(table.cardId),
    index("price_alerts_active_idx").on(table.active, table.triggered),
  ]
);
