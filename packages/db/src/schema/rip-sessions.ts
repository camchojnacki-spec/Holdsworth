import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

/**
 * B-006: Pack Rip Mode — batch scanning with deferred review.
 *
 * A rip session represents opening a pack/box.
 * Cards are scanned quickly and queued for review.
 */
export const ripSessions = pgTable("rip_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).default("Pack Rip").notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, reviewing, completed
  cardCount: integer("card_count").default(0).notNull(),
  reviewedCount: integer("reviewed_count").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const ripCards = pgTable(
  "rip_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").references(() => ripSessions.id, { onDelete: "cascade" }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),

    // AI scan results (stored before review)
    aiResult: jsonb("ai_result"),               // Full CardScanResponse
    frontPhotoUrl: text("front_photo_url"),      // Data URL or GCS URL
    backPhotoUrl: text("back_photo_url"),
    croppedPhotoUrl: text("cropped_photo_url"),
    confidence: integer("confidence"),            // 0-100

    // Review status
    status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, reviewed, skipped, catalogued
    reviewed: boolean("reviewed").default(false).notNull(),
    userEdits: jsonb("user_edits"),              // Fields user corrected

    // After cataloguing, link to actual card
    cataloguedCardId: uuid("catalogued_card_id").references(() => cards.id),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rip_cards_session_idx").on(table.sessionId),
  ]
);
