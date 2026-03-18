import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const manufacturers = pgTable("manufacturers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
