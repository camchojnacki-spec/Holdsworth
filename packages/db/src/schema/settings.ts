import { pgTable, uuid, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userSettings = pgTable("user_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  province: varchar("province", { length: 5 }).default("ON").notNull(),
  updateFrequency: varchar("update_frequency", { length: 20 }).default("weekly").notNull(),
  alertThreshold: integer("alert_threshold").default(10).notNull(),
  preferences: jsonb("preferences"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
