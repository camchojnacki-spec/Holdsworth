import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { cards } from "./cards";

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#8B2252").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cardTags = pgTable("card_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "cascade" }).notNull(),
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
});
