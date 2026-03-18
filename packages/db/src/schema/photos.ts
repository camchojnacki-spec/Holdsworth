import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const cardPhotos = pgTable("card_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .references(() => cards.id, { onDelete: "cascade" })
    .notNull(),
  originalUrl: varchar("original_url", { length: 1000 }).notNull(),
  displayUrl: varchar("display_url", { length: 1000 }),
  thumbnailUrl: varchar("thumbnail_url", { length: 1000 }),
  photoType: varchar("photo_type", { length: 20 }).default("front").notNull(),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
