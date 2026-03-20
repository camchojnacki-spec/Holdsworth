import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const correctionLog = pgTable(
  "correction_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .references(() => cards.id, { onDelete: "cascade" })
      .notNull(),
    correctionType: varchar("correction_type", { length: 50 }).notNull(),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    aiOriginalValue: text("ai_original_value"),
    userCorrectedValue: text("user_corrected_value"),
    referenceMatchedAfter: boolean("reference_matched_after").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("correction_log_card_id_idx").on(table.cardId),
    index("correction_log_created_at_idx").on(table.createdAt),
  ]
);
