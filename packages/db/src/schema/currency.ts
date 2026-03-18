import { pgTable, uuid, varchar, numeric, timestamp } from "drizzle-orm/pg-core";

export const currencyRates = pgTable("currency_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromCurrency: varchar("from_currency", { length: 3 }).notNull(),
  toCurrency: varchar("to_currency", { length: 3 }).notNull(),
  rate: numeric("rate", { precision: 10, scale: 6 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
