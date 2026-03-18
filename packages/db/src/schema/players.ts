import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  team: varchar("team", { length: 255 }),
  position: varchar("position", { length: 100 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
