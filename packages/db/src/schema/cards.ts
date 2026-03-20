import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { players } from "./players";
import { sets } from "./sets";
import { referenceCards } from "./reference";

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    playerId: uuid("player_id").references(() => players.id),
    setId: uuid("set_id").references(() => sets.id),
    cardNumber: varchar("card_number", { length: 50 }),
    year: integer("year"),
    parallelVariant: varchar("parallel_variant", { length: 255 }),
    isRookieCard: boolean("is_rookie_card").default(false),

    // Condition
    condition: varchar("condition", { length: 50 }),
    conditionNotes: text("condition_notes"),
    graded: boolean("graded").default(false),
    gradingCompany: varchar("grading_company", { length: 50 }),
    grade: varchar("grade", { length: 20 }),

    // Ownership
    quantity: integer("quantity").default(1),
    purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
    purchaseCurrency: varchar("purchase_currency", { length: 3 }).default("CAD"),
    purchaseDate: timestamp("purchase_date"),
    purchaseSource: varchar("purchase_source", { length: 255 }),

    // Status
    status: varchar("status", { length: 50 }).default("in_collection").notNull(),
    notes: text("notes"),

    // Sale tracking (when status = "sold")
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
    saleCurrency: varchar("sale_currency", { length: 3 }),
    saleDate: timestamp("sale_date"),
    salePlatform: varchar("sale_platform", { length: 100 }),

    // Reference matching
    referenceCardId: uuid("reference_card_id").references(() => referenceCards.id),
    subsetOrInsert: varchar("subset_or_insert", { length: 255 }),
    isAutograph: boolean("is_autograph").default(false),
    isRelic: boolean("is_relic").default(false),
    aiCorrected: boolean("ai_corrected").default(false),

    // AI scan data
    aiRawResponse: jsonb("ai_raw_response"),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("cards_player_set_year_idx").on(table.playerId, table.setId, table.year),
    index("cards_status_idx").on(table.status),
    index("cards_year_idx").on(table.year),
  ]
);
