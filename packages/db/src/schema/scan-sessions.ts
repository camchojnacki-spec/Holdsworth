import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const scanSessions = pgTable("scan_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  photoUrl: varchar("photo_url", { length: 1000 }).notNull(),
  aiProvider: varchar("ai_provider", { length: 50 }).default("gemini"),
  aiResponse: jsonb("ai_response"),
  identifiedCardId: uuid("identified_card_id").references(() => cards.id),
  confidenceScore: numeric("confidence_score", { precision: 3, scale: 2 }),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
