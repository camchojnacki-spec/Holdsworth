import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const pricingJobs = pgTable(
  "pricing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    jobType: varchar("job_type", { length: 50 }).notNull(), // 'price_lookup' | 'price_refresh' | 'vendor_check'
    status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed'
    priority: integer("priority").default(0), // higher = runs first
    payload: jsonb("payload"), // card data needed for scraping
    result: jsonb("result"), // summary on completion
    errorMessage: text("error_message"),
    errorCount: integer("error_count").default(0),
    maxRetries: integer("max_retries").default(3),
    lockedAt: timestamp("locked_at"),
    lockedBy: varchar("locked_by", { length: 100 }),
    scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("pricing_jobs_poll_idx").on(table.status, table.priority, table.scheduledFor),
    index("pricing_jobs_card_idx").on(table.cardId),
    index("pricing_jobs_locked_idx").on(table.lockedAt),
  ]
);
