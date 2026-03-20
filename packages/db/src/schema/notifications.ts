import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 50 }).notNull(), // 'price_alert' | 'stale_price' | 'system'
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message"),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    read: boolean("read").default(false).notNull(),
    metadata: jsonb("metadata"), // extra data (alertId, oldPrice, newPrice, etc.)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_unread_idx").on(table.read, table.createdAt),
    index("notifications_card_idx").on(table.cardId),
    index("notifications_type_idx").on(table.type),
  ]
);
