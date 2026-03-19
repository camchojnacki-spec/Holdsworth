/**
 * Seed script for 2025 Topps Series 1 Baseball reference data.
 * Run with: npx tsx apps/web/src/scripts/seed-2025-topps-s1.ts
 *
 * This creates the setProduct, subsets, parallelTypes, and referenceCards
 * for 2025 Topps Series 1 so the scanner can match cards against known data.
 */

import { db, manufacturers, setProducts, subsets, referenceCards, parallelTypes } from "@holdsworth/db";
import { eq, and } from "drizzle-orm";

async function seed() {
  console.log("Seeding 2025 Topps Series 1...");

  // ── Find or create Topps manufacturer ──
  let [topps] = await db.select().from(manufacturers).where(eq(manufacturers.name, "Topps")).limit(1);
  if (!topps) {
    [topps] = await db.insert(manufacturers).values({ name: "Topps" }).returning();
  }

  // ── Create set product ──
  let [product] = await db.select().from(setProducts)
    .where(and(eq(setProducts.name, "Topps Series 1"), eq(setProducts.year, 2025)))
    .limit(1);

  if (!product) {
    [product] = await db.insert(setProducts).values({
      manufacturerId: topps.id,
      name: "Topps Series 1",
      year: 2025,
      sport: "baseball",
      releaseDate: "2025-02-12",
      baseSetSize: 330,
      sourceUrl: "https://www.cardboardconnection.com/2025-topps-series-1-baseball-card-set-review-and-checklist",
    }).returning();
  }
  console.log(`Set product: ${product.name} (${product.id})`);

  // ── Create subsets ──
  const subsetDefs = [
    { name: "Base Set", subsetType: "base", numberingPattern: null, totalCards: 330, isAutograph: false, isRelic: false },
    { name: "1990 Topps Baseball Autographs", subsetType: "autograph", numberingPattern: "90A-*", totalCards: 201, isAutograph: true, isRelic: false },
    { name: "1990 Topps Chrome Mojo Autographs", subsetType: "autograph", numberingPattern: "90CA-*", totalCards: 92, isAutograph: true, isRelic: false },
    { name: "Flagship Real One Autographs", subsetType: "autograph", numberingPattern: "FRO-*", totalCards: 47, isAutograph: true, isRelic: false },
    { name: "Baseball Stars Autographs", subsetType: "autograph", numberingPattern: "BSA-*", totalCards: null, isAutograph: true, isRelic: false },
    { name: "1990 Topps Baseball Relics", subsetType: "relic", numberingPattern: "90R-*", totalCards: null, isAutograph: false, isRelic: true },
    { name: "Major League Material", subsetType: "relic", numberingPattern: "MLM-*", totalCards: null, isAutograph: false, isRelic: true },
    { name: "20/20 Vision", subsetType: "insert", numberingPattern: "2020-*", totalCards: null, isAutograph: false, isRelic: false },
    { name: "Past Meets Present", subsetType: "insert", numberingPattern: "PMP-*", totalCards: null, isAutograph: false, isRelic: false },
    { name: "Future Stars", subsetType: "insert", numberingPattern: "FS-*", totalCards: null, isAutograph: false, isRelic: false },
    { name: "Golden Greats Die-Cuts", subsetType: "insert", numberingPattern: "GG-*", totalCards: null, isAutograph: false, isRelic: false },
  ];

  const subsetMap: Record<string, typeof subsets.$inferSelect> = {};
  for (const def of subsetDefs) {
    let [existing] = await db.select().from(subsets)
      .where(and(eq(subsets.setProductId, product.id), eq(subsets.name, def.name)))
      .limit(1);

    if (!existing) {
      [existing] = await db.insert(subsets).values({
        setProductId: product.id,
        ...def,
      }).returning();
    }
    subsetMap[def.name] = existing;
    console.log(`  Subset: ${def.name} (${existing.id})`);
  }

  // ── Create parallel types ──
  const parallelDefs = [
    { name: "Gold", printRun: 2025, serialNumbered: true },
    { name: "Green Foilboard", printRun: 499, serialNumbered: true },
    { name: "Orange Foilboard", printRun: 299, serialNumbered: true },
    { name: "Red Foilboard", printRun: 199, serialNumbered: true },
    { name: "Black", printRun: 71, serialNumbered: true },
    { name: "Mother's Day Pink", printRun: 50, serialNumbered: true },
    { name: "Father's Day Powder Blue", printRun: 50, serialNumbered: true },
    { name: "Independence Day", printRun: 76, serialNumbered: true },
    { name: "Platinum", printRun: 1, serialNumbered: true },
    { name: "Rainbow Foil", printRun: null, serialNumbered: false },
    { name: "Vintage Stock", printRun: 99, serialNumbered: true },
  ];

  for (const def of parallelDefs) {
    const [existing] = await db.select().from(parallelTypes)
      .where(and(eq(parallelTypes.setProductId, product.id), eq(parallelTypes.name, def.name)))
      .limit(1);

    if (!existing) {
      await db.insert(parallelTypes).values({
        setProductId: product.id,
        ...def,
      });
    }
  }
  console.log(`  ${parallelDefs.length} parallel types`);

  // ── Seed 1990 Topps Baseball Autographs (90A-) ──
  // Partial list from Beckett/Cardboard Connection. Expandable via scraper.
  const autoCards: [string, string, string][] = [
    // [cardNumber, playerName, team]
    ["90A-AA", "Adael Amador", "Colorado Rockies"],
    ["90A-AD", "Andre Dawson", "Chicago Cubs"],
    ["90A-AJ", "Adam Jones", "Baltimore Orioles"],
    ["90A-AK", "Adam Kloffenstein", "St. Louis Cardinals"],
    ["90A-AMZ", "Angel Martinez", "Cleveland Guardians"],
    ["90A-AN", "Aaron Nola", "Philadelphia Phillies"],
    ["90A-AP", "Andy Pettitte", "New York Yankees"],
    ["90A-AR", "Anthony Rizzo", "New York Yankees"],
    ["90A-AS", "Aaron Schunk", "Colorado Rockies"],
    ["90A-AT", "Alan Trammell", "Detroit Tigers"],
    ["90A-AV", "Anthony Volpe", "New York Yankees"],
    ["90A-AVE", "Alex Verdugo", "New York Yankees"],
    ["90A-AVS", "Andy Van Slyke", "Pittsburgh Pirates"],
    ["90A-BB", "Bert Blyleven", "California Angels"],
    ["90A-BBA", "Brady Basso", "Oakland Athletics"],
    ["90A-BBN", "Brooks Baldwin", "Chicago White Sox"],
    ["90A-BBO", "Barry Bonds", "San Francisco Giants"],
    ["90A-BBR", "Ben Brown", "Chicago Cubs"],
    ["90A-BL", "Brooks Lee", "Minnesota Twins"],
    ["90A-BN", "Brandon Nimmo", "New York Mets"],
    ["90A-BR", "Bryan Reynolds", "Pittsburgh Pirates"],
    ["90A-BRI", "Ben Rice", "New York Yankees"],
    ["90A-BRN", "Billy Ripken", "Baltimore Orioles"],
    ["90A-BW", "Bernie Williams", "New York Yankees"],
    ["90A-BWI", "Brian Wilson", "San Francisco Giants"],
    ["90A-CA", "CJ Abrams", "Washington Nationals"],
    ["90A-CBE", "Carlos Beltran", "New York Yankees"],
    ["90A-CBU", "Corbin Burnes", "Baltimore Orioles"],
    ["90A-CC", "Colton Cowser", "Baltimore Orioles"],
    ["90A-CL", "Cliff Lee", "Philadelphia Phillies"],
    ["90A-CM", "Christopher Morel", "Tampa Bay Rays"],
    ["90A-CR", "Cole Ragans", "Kansas City Royals"],
    ["90A-CRA", "Cal Raleigh", "Seattle Mariners"],
    ["90A-CS", "Christian Scott", "New York Mets"],
    ["90A-DJ", "David Justice", "Atlanta Braves"],
    ["90A-DM", "Dale Murphy", "Atlanta Braves"],
    ["90A-DP", "Dustin Pedroia", "Boston Red Sox"],
    ["90A-DS", "Dave Stieb", "Toronto Blue Jays"],
    ["90A-ED", "Eric Davis", "Cincinnati Reds"],
    ["90A-EM", "Edgar Martinez", "Seattle Mariners"],
    // Cameron's card:
    ["90A-LAC", "Luisangel Acuna", "New York Mets"],
  ];

  const autoSubset = subsetMap["1990 Topps Baseball Autographs"];
  let inserted = 0;
  for (const [cardNumber, playerName, team] of autoCards) {
    const [existing] = await db.select().from(referenceCards)
      .where(and(eq(referenceCards.setProductId, product.id), eq(referenceCards.cardNumber, cardNumber)))
      .limit(1);

    if (!existing) {
      await db.insert(referenceCards).values({
        setProductId: product.id,
        subsetId: autoSubset.id,
        cardNumber,
        playerName,
        team,
        isRookieCard: false,
        isAutograph: true,
        isRelic: false,
        isShortPrint: false,
      });
      inserted++;
    }
  }
  console.log(`  Inserted ${inserted} reference cards for 1990 Topps Baseball Autographs`);

  console.log("Done! Reference data seeded for 2025 Topps Series 1.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
