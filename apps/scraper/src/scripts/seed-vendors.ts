/**
 * Seed initial vendor records for the vendor scraping pipeline.
 *
 * Usage: pnpm --filter scraper exec tsx src/scripts/seed-vendors.ts
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const envPath = resolve(__dirname, "../../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

const { db, vendors } = await import("@holdsworth/db");
const { sql } = await import("drizzle-orm");

const vendorData = [
  {
    name: "Dave & Adam's",
    websiteUrl: "https://www.dacardworld.com",
    shipsToCanada: true,
    country: "USA",
    notes: "Large selection, Shopify-based. Good prices, ships internationally.",
  },
  {
    name: "Blowout Cards",
    websiteUrl: "https://www.blowoutcards.com",
    shipsToCanada: true,
    country: "USA",
    notes: "Large catalog with pre-orders. Shopify-based.",
  },
  {
    name: "Steel City Collectibles",
    websiteUrl: "https://www.steelcitycollectibles.com",
    shipsToCanada: true,
    country: "USA",
    notes: "Major US retailer, custom platform (not Shopify).",
  },
  {
    name: "401 Games",
    websiteUrl: "https://store.401games.ca",
    shipsToCanada: true,
    country: "Canada",
    notes: "Canadian retailer based in Ontario.",
  },
  {
    name: "Cloutsnchara",
    websiteUrl: "https://cloutsnchara.com",
    shipsToCanada: true,
    country: "Canada",
    notes: "Canadian card retailer.",
  },
];

async function main() {
  for (const v of vendorData) {
    await db
      .insert(vendors)
      .values(v)
      .onConflictDoNothing();
    console.log(`Upserted vendor: ${v.name}`);
  }

  const all = await db.select().from(vendors);
  console.log(`\nTotal vendors: ${all.length}`);
  for (const v of all) {
    console.log(`  ${v.name} — ${v.websiteUrl} (ships to CA: ${v.shipsToCanada})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
