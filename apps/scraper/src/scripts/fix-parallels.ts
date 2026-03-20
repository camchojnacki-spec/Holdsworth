/**
 * Fix parallel types:
 * 1. Remove duplicates
 * 2. Add missing parallels (including /399)
 *
 * Usage: pnpm --filter scraper exec tsx src/scripts/fix-parallels.ts
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

const { db, parallelTypes, setProducts } = await import("@holdsworth/db");
const { eq, and, sql } = await import("drizzle-orm");

async function main() {
  // Find the 2025 Topps Series 1 product
  const [product] = await db
    .select()
    .from(setProducts)
    .where(and(eq(setProducts.name, "Topps Series 1"), eq(setProducts.year, 2025)))
    .limit(1);

  if (!product) {
    console.log("No 2025 Topps Series 1 product found");
    process.exit(1);
  }

  console.log("Product:", product.id, product.name, product.year);

  // Get all current parallels
  const currentParallels = await db
    .select()
    .from(parallelTypes)
    .where(eq(parallelTypes.setProductId, product.id));

  console.log(`\nCurrent parallels (${currentParallels.length}):`);
  for (const p of currentParallels) {
    console.log(`  ${p.id} | ${p.name} | printRun: ${p.printRun}`);
  }

  // Step 1: Remove ALL existing parallels for this set (clean slate)
  await db.delete(parallelTypes).where(eq(parallelTypes.setProductId, product.id));
  console.log(`\nDeleted ${currentParallels.length} existing parallels`);

  // Step 2: Insert the CORRECT, complete parallel list for 2025 Topps Series 1
  // Based on actual Topps Series 1 2025 checklist data
  const correctParallels = [
    // Unnumbered parallels
    { name: "Base", printRun: null, serialNumbered: false, colorFamily: null, finishType: null, exclusiveTo: null, priceMultiplier: "1.00" },
    { name: "Rainbow Foil", printRun: null, serialNumbered: false, colorFamily: "rainbow", finishType: "foil", exclusiveTo: null, priceMultiplier: "2.00" },
    { name: "Royal Blue", printRun: null, serialNumbered: false, colorFamily: "blue", finishType: null, exclusiveTo: "retail", priceMultiplier: "2.50" },

    // Numbered parallels (high to low print run)
    { name: "Gold /2025", printRun: 2025, serialNumbered: true, colorFamily: "gold", finishType: null, exclusiveTo: null, priceMultiplier: "3.00" },
    { name: "Green Foilboard /499", printRun: 499, serialNumbered: true, colorFamily: "green", finishType: "foil", exclusiveTo: null, priceMultiplier: "5.00" },
    { name: "Yellow Foilboard /399", printRun: 399, serialNumbered: true, colorFamily: "yellow", finishType: "foil", exclusiveTo: null, priceMultiplier: "6.00" },
    { name: "Orange Foilboard /299", printRun: 299, serialNumbered: true, colorFamily: "orange", finishType: "foil", exclusiveTo: null, priceMultiplier: "8.00" },
    { name: "Red Foilboard /199", printRun: 199, serialNumbered: true, colorFamily: "red", finishType: "foil", exclusiveTo: null, priceMultiplier: "12.00" },
    { name: "Vintage Stock /99", printRun: 99, serialNumbered: true, colorFamily: null, finishType: "matte", exclusiveTo: null, priceMultiplier: "20.00" },
    { name: "Independence Day /76", printRun: 76, serialNumbered: true, colorFamily: "red", finishType: null, exclusiveTo: null, priceMultiplier: "25.00" },
    { name: "Black /75", printRun: 75, serialNumbered: true, colorFamily: "black", finishType: null, exclusiveTo: null, priceMultiplier: "30.00" },
    { name: "Father's Day Powder Blue /50", printRun: 50, serialNumbered: true, colorFamily: "blue", finishType: null, exclusiveTo: null, priceMultiplier: "35.00" },
    { name: "Mother's Day Pink /50", printRun: 50, serialNumbered: true, colorFamily: "pink", finishType: null, exclusiveTo: null, priceMultiplier: "35.00" },
    { name: "Memorial Day Camo /25", printRun: 25, serialNumbered: true, colorFamily: "camo", finishType: null, exclusiveTo: null, priceMultiplier: "60.00" },
    { name: "Clear /10", printRun: 10, serialNumbered: true, colorFamily: null, finishType: "clear", exclusiveTo: null, priceMultiplier: "100.00" },
    { name: "Gold Sparkle /5", printRun: 5, serialNumbered: true, colorFamily: "gold", finishType: "sparkle", exclusiveTo: null, priceMultiplier: "150.00" },
    { name: "Platinum Anniversary /1", printRun: 1, serialNumbered: true, colorFamily: "platinum", finishType: null, exclusiveTo: null, priceMultiplier: "200.00" },
    { name: "Printing Plate Black /1", printRun: 1, serialNumbered: true, colorFamily: "black", finishType: "plate", exclusiveTo: null, priceMultiplier: "150.00" },
    { name: "Printing Plate Cyan /1", printRun: 1, serialNumbered: true, colorFamily: "cyan", finishType: "plate", exclusiveTo: null, priceMultiplier: "150.00" },
    { name: "Printing Plate Magenta /1", printRun: 1, serialNumbered: true, colorFamily: "magenta", finishType: "plate", exclusiveTo: null, priceMultiplier: "150.00" },
    { name: "Printing Plate Yellow /1", printRun: 1, serialNumbered: true, colorFamily: "yellow", finishType: "plate", exclusiveTo: null, priceMultiplier: "150.00" },
  ];

  for (const p of correctParallels) {
    await db.insert(parallelTypes).values({
      setProductId: product.id,
      name: p.name,
      printRun: p.printRun,
      serialNumbered: p.serialNumbered,
      colorFamily: p.colorFamily,
      finishType: p.finishType,
      exclusiveTo: p.exclusiveTo,
      priceMultiplier: p.priceMultiplier,
    });
  }

  console.log(`\nInserted ${correctParallels.length} clean parallels`);

  // Verify
  const final = await db
    .select()
    .from(parallelTypes)
    .where(eq(parallelTypes.setProductId, product.id));
  console.log(`\nFinal parallel count: ${final.length}`);
  for (const p of final) {
    console.log(`  ${p.name}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
