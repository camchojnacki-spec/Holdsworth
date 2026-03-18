import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertType: varchar("alert_type", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    message: text("message").notNull(),
    thresholdValue: numeric("threshold_value", { precision: 10, scale: 2 }),
    triggeredValue: numeric("triggered_value", { precision: 10, scale: 2 }),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("alerts_unread_idx").on(table.isRead, table.createdAt),
  ]
);
