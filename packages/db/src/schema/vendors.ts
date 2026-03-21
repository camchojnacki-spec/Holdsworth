import {
  pgTable,
  uuid,
  varchar,
  numeric,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { setProducts } from "./reference";

export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  websiteUrl: varchar("website_url", { length: 500 }).notNull(),
  shipsToCanada: boolean("ships_to_canada").default(false),
  country: varchar("country", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vendorProducts = pgTable(
  "vendor_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vendorId: uuid("vendor_id")
      .references(() => vendors.id, { onDelete: "cascade" })
      .notNull(),
    setProductId: uuid("set_product_id")
      .references(() => setProducts.id),
    productName: varchar("product_name", { length: 500 }).notNull(),
    productUrl: varchar("product_url", { length: 1000 }),
    productType: varchar("product_type", { length: 50 }),
    sport: varchar("sport", { length: 100 }).default("baseball"),
    year: integer("year"),
    setName: varchar("set_name", { length: 255 }),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
    priceCad: numeric("price_cad", { precision: 10, scale: 2 }),
    shippingCad: numeric("shipping_cad", { precision: 10, scale: 2 }),
    estimatedTariff: numeric("estimated_tariff", { precision: 10, scale: 2 }),
    estimatedTax: numeric("estimated_tax", { precision: 10, scale: 2 }),
    totalLandedCad: numeric("total_landed_cad", { precision: 10, scale: 2 }),
    inStock: boolean("in_stock").default(true),
    lastChecked: timestamp("last_checked"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("vendor_products_vendor_stock_idx").on(table.vendorId, table.inStock),
    index("vendor_products_last_checked_idx").on(table.lastChecked),
  ]
);

export const vendorPriceHistory = pgTable("vendor_price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorProductId: uuid("vendor_product_id")
    .references(() => vendorProducts.id, { onDelete: "cascade" })
    .notNull(),
  priceCad: numeric("price_cad", { precision: 10, scale: 2 }),
  inStock: boolean("in_stock"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
