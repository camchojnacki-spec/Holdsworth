import { pgTable, uuid, varchar, text, integer, timestamp } from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const cardPhotos = pgTable("card_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .references(() => cards.id, { onDelete: "cascade" })
    .notNull(),
  originalUrl: text("original_url").notNull(),
  displayUrl: text("display_url"),
  thumbnailUrl: text("thumbnail_url"),
  photoType: varchar("photo_type", { length: 20 }).default("front").notNull(),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
