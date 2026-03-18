import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { manufacturers } from "./manufacturers";

export const sets = pgTable("sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  year: integer("year").notNull(),
  manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
  sport: varchar("sport", { length: 100 }).default("baseball"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
