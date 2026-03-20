import {
  db,
  setProducts,
  subsets,
  referenceCards,
  parallelTypes,
  manufacturers,
} from "@holdsworth/db";
import { eq, and } from "drizzle-orm";
import { scrapeTcdbChecklist, searchTcdbSet } from "../scrapers/scrape-tcdb";
import { log, logError } from "../lib/logger";

interface IngestOptions {
  /** TCDB set ID (numeric) */
  tcdbSetId?: string;
  /** TCDB checklist URL — set ID is extracted from it */
  tcdbUrl?: string;
  /** Product metadata overrides (used when we know the product details) */
  productOverrides?: {
    name?: string;
    year?: number;
    manufacturer?: string;
    baseSetSize?: number;
    sport?: string;
  };
}

interface IngestResult {
  success: boolean;
  setProductId: string | null;
  cardsUpserted: number;
  parallelsUpserted: number;
  error?: string;
}

/**
 * Ingest a checklist from TCDB into the reference database.
 *
 * 1. Resolves the TCDB set ID from URL or direct ID
 * 2. Scrapes the checklist data
 * 3. Creates/updates the setProducts record
 * 4. Upserts referenceCards entries
 * 5. Upserts parallelTypes entries if available
 */
export async function ingestChecklist(options: IngestOptions): Promise<IngestResult> {
  const { productOverrides } = options;

  // Resolve set ID
  let setId = options.tcdbSetId;
  if (!setId && options.tcdbUrl) {
    const match = options.tcdbUrl.match(/sid\/(\d+)/);
    if (match) {
      setId = match[1];
    } else {
      return { success: false, setProductId: null, cardsUpserted: 0, parallelsUpserted: 0, error: "Could not extract set ID from URL" };
    }
  }

  if (!setId) {
    return { success: false, setProductId: null, cardsUpserted: 0, parallelsUpserted: 0, error: "No TCDB set ID or URL provided" };
  }

  // Scrape the checklist
  log("checklist-ingest", `Starting ingest for TCDB set ${setId}`);
  const scrapeResult = await scrapeTcdbChecklist(setId);

  if (!scrapeResult.success || scrapeResult.entries.length === 0) {
    log("checklist-ingest", `Scrape returned ${scrapeResult.entries.length} entries, using overrides if available`);
    // Even if scrape fails, we can still create the product record from overrides
    if (!productOverrides?.name || !productOverrides?.year) {
      return {
        success: false,
        setProductId: null,
        cardsUpserted: 0,
        parallelsUpserted: 0,
        error: scrapeResult.error || "No checklist data and no product overrides",
      };
    }
  }

  try {
    // Resolve manufacturer
    let manufacturerId: string | null = null;
    if (productOverrides?.manufacturer) {
      const [mfr] = await db
        .select()
        .from(manufacturers)
        .where(eq(manufacturers.name, productOverrides.manufacturer))
        .limit(1);

      if (mfr) {
        manufacturerId = mfr.id;
      } else {
        const [newMfr] = await db
          .insert(manufacturers)
          .values({ name: productOverrides.manufacturer })
          .returning();
        manufacturerId = newMfr.id;
      }
    }

    // Upsert setProduct
    const productName = productOverrides?.name || `TCDB Set ${setId}`;
    const productYear = productOverrides?.year || new Date().getFullYear();

    const [existingProduct] = await db
      .select()
      .from(setProducts)
      .where(and(eq(setProducts.name, productName), eq(setProducts.year, productYear)))
      .limit(1);

    let setProductId: string;

    if (existingProduct) {
      setProductId = existingProduct.id;
      await db
        .update(setProducts)
        .set({
          sourceUrl: scrapeResult.url,
          lastScrapedAt: new Date(),
          baseSetSize: productOverrides?.baseSetSize ?? existingProduct.baseSetSize,
          ...(manufacturerId ? { manufacturerId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(setProducts.id, existingProduct.id));
      log("checklist-ingest", `Updated existing product: ${productName} ${productYear}`, { setProductId });
    } else {
      const [newProduct] = await db
        .insert(setProducts)
        .values({
          name: productName,
          year: productYear,
          sport: productOverrides?.sport || "baseball",
          baseSetSize: productOverrides?.baseSetSize,
          sourceUrl: scrapeResult.url,
          lastScrapedAt: new Date(),
          ...(manufacturerId ? { manufacturerId } : {}),
        })
        .returning();
      setProductId = newProduct.id;
      log("checklist-ingest", `Created new product: ${productName} ${productYear}`, { setProductId });
    }

    // Upsert referenceCards from scraped data
    let cardsUpserted = 0;
    const subsetCache: Record<string, string> = {};

    for (const entry of scrapeResult.entries) {
      // Resolve subset if present
      let subsetId: string | undefined;
      if (entry.subsetName) {
        if (subsetCache[entry.subsetName]) {
          subsetId = subsetCache[entry.subsetName];
        } else {
          const [existing] = await db
            .select()
            .from(subsets)
            .where(and(eq(subsets.setProductId, setProductId), eq(subsets.name, entry.subsetName)))
            .limit(1);

          if (existing) {
            subsetId = existing.id;
          } else {
            const [newSubset] = await db
              .insert(subsets)
              .values({
                setProductId,
                name: entry.subsetName,
                subsetType: "insert",
              })
              .returning();
            subsetId = newSubset.id;
          }
          subsetCache[entry.subsetName] = subsetId;
        }
      }

      // Upsert reference card
      await db
        .insert(referenceCards)
        .values({
          setProductId,
          subsetId: subsetId || null,
          cardNumber: entry.cardNumber,
          playerName: entry.playerName,
          team: entry.team || null,
          isRookieCard: entry.isRookieCard,
        })
        .onConflictDoUpdate({
          target: [referenceCards.setProductId, referenceCards.cardNumber],
          set: {
            playerName: entry.playerName,
            team: entry.team || null,
            isRookieCard: entry.isRookieCard,
            ...(subsetId ? { subsetId } : {}),
          },
        });

      cardsUpserted++;

      if (cardsUpserted % 50 === 0) {
        log("checklist-ingest", `Upserted ${cardsUpserted} cards...`);
      }
    }

    log("checklist-ingest", `Ingest complete: ${cardsUpserted} cards`, { setProductId });

    return {
      success: true,
      setProductId,
      cardsUpserted,
      parallelsUpserted: 0,
    };
  } catch (err) {
    logError("checklist-ingest", "Ingest failed", err);
    return {
      success: false,
      setProductId: null,
      cardsUpserted: 0,
      parallelsUpserted: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

interface SeedSubset {
  name: string;
  subsetType: string; // "insert", "auto", "relic", "sp", "parallel", "base"
  numberingPattern?: string;
  baseSetSize?: number;
  isNumbered?: boolean;
  printRun?: number;
  isAutograph?: boolean;
  isRelic?: boolean;
  cards?: Array<{
    cardNumber: string;
    playerName: string;
    team?: string;
    isRookieCard?: boolean;
    isAutograph?: boolean;
    isRelic?: boolean;
    isShortPrint?: boolean;
    position?: string;
    jerseyNumber?: string;
    printRun?: number;
    notes?: string;
  }>;
  parallels?: Array<{
    name: string;
    printRun?: number;
    serialNumbered?: boolean;
    colorFamily?: string;
    finishType?: string;
    exclusiveTo?: string;
    priceMultiplier?: string;
  }>;
}

/**
 * Directly seed a setProduct, reference cards, and parallel types from hardcoded data.
 * Used when TCDB scraping is unreliable or for critical seed data.
 *
 * Supports optional `subsets` array for insert sets, autograph sets, etc.
 * Each subset can have its own cards and parallel types.
 */
export async function seedProductData(data: {
  product: {
    name: string;
    year: number;
    manufacturer: string;
    baseSetSize?: number;
    sport?: string;
  };
  cards: Array<{
    cardNumber: string;
    playerName: string;
    team?: string;
    isRookieCard?: boolean;
    position?: string;
    jerseyNumber?: string;
    notes?: string;
  }>;
  parallels: Array<{
    name: string;
    printRun?: number;
    serialNumbered?: boolean;
    colorFamily?: string;
    finishType?: string;
    exclusiveTo?: string;
    priceMultiplier?: string;
  }>;
  subsets?: SeedSubset[];
}): Promise<IngestResult> {
  try {
    // Resolve manufacturer
    let manufacturerId: string | null = null;
    const [mfr] = await db
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.name, data.product.manufacturer))
      .limit(1);

    if (mfr) {
      manufacturerId = mfr.id;
    } else {
      const [newMfr] = await db
        .insert(manufacturers)
        .values({ name: data.product.manufacturer })
        .returning();
      manufacturerId = newMfr.id;
    }

    // Upsert setProduct
    const [existingProduct] = await db
      .select()
      .from(setProducts)
      .where(and(eq(setProducts.name, data.product.name), eq(setProducts.year, data.product.year)))
      .limit(1);

    let setProductId: string;

    if (existingProduct) {
      setProductId = existingProduct.id;
      await db
        .update(setProducts)
        .set({
          baseSetSize: data.product.baseSetSize ?? existingProduct.baseSetSize,
          manufacturerId,
          updatedAt: new Date(),
        })
        .where(eq(setProducts.id, existingProduct.id));
      log("seed", `Updated existing product: ${data.product.name} ${data.product.year}`);
    } else {
      const [newProduct] = await db
        .insert(setProducts)
        .values({
          name: data.product.name,
          year: data.product.year,
          sport: data.product.sport || "baseball",
          baseSetSize: data.product.baseSetSize,
          manufacturerId,
        })
        .returning();
      setProductId = newProduct.id;
      log("seed", `Created product: ${data.product.name} ${data.product.year}`);
    }

    // Upsert reference cards
    let cardsUpserted = 0;
    for (const card of data.cards) {
      await db
        .insert(referenceCards)
        .values({
          setProductId,
          cardNumber: card.cardNumber,
          playerName: card.playerName,
          team: card.team || null,
          isRookieCard: card.isRookieCard || false,
          position: card.position || null,
          jerseyNumber: card.jerseyNumber || null,
          notes: card.notes || null,
        })
        .onConflictDoUpdate({
          target: [referenceCards.setProductId, referenceCards.cardNumber],
          set: {
            playerName: card.playerName,
            team: card.team || null,
            isRookieCard: card.isRookieCard || false,
            position: card.position || null,
            jerseyNumber: card.jerseyNumber || null,
            notes: card.notes || null,
          },
        });
      cardsUpserted++;
    }

    // Upsert parallel types
    let parallelsUpserted = 0;
    for (const parallel of data.parallels) {
      // Check if parallel already exists for this product
      const [existing] = await db
        .select()
        .from(parallelTypes)
        .where(and(eq(parallelTypes.setProductId, setProductId), eq(parallelTypes.name, parallel.name)))
        .limit(1);

      if (existing) {
        await db
          .update(parallelTypes)
          .set({
            printRun: parallel.printRun ?? existing.printRun,
            serialNumbered: parallel.serialNumbered ?? existing.serialNumbered,
            colorFamily: parallel.colorFamily ?? existing.colorFamily,
            finishType: parallel.finishType ?? existing.finishType,
            exclusiveTo: parallel.exclusiveTo ?? existing.exclusiveTo,
            priceMultiplier: parallel.priceMultiplier ?? existing.priceMultiplier,
          })
          .where(eq(parallelTypes.id, existing.id));
      } else {
        await db
          .insert(parallelTypes)
          .values({
            setProductId,
            name: parallel.name,
            printRun: parallel.printRun,
            serialNumbered: parallel.serialNumbered || false,
            colorFamily: parallel.colorFamily,
            finishType: parallel.finishType,
            exclusiveTo: parallel.exclusiveTo,
            priceMultiplier: parallel.priceMultiplier,
          });
      }
      parallelsUpserted++;
    }

    // Upsert subsets (insert sets, autograph sets, etc.)
    if (data.subsets) {
      for (const subset of data.subsets) {
        // Upsert the subset record
        const [existingSubset] = await db
          .select()
          .from(subsets)
          .where(and(eq(subsets.setProductId, setProductId), eq(subsets.name, subset.name)))
          .limit(1);

        let subsetId: string;

        if (existingSubset) {
          subsetId = existingSubset.id;
          await db
            .update(subsets)
            .set({
              subsetType: subset.subsetType,
              numberingPattern: subset.numberingPattern ?? existingSubset.numberingPattern,
              baseSetSize: subset.baseSetSize ?? existingSubset.baseSetSize,
              totalCards: subset.baseSetSize ?? existingSubset.totalCards,
              isNumbered: subset.isNumbered ?? existingSubset.isNumbered,
              printRun: subset.printRun ?? existingSubset.printRun,
              isAutograph: subset.isAutograph ?? existingSubset.isAutograph,
              isRelic: subset.isRelic ?? existingSubset.isRelic,
            })
            .where(eq(subsets.id, existingSubset.id));
        } else {
          const [newSubset] = await db
            .insert(subsets)
            .values({
              setProductId,
              name: subset.name,
              subsetType: subset.subsetType,
              numberingPattern: subset.numberingPattern,
              baseSetSize: subset.baseSetSize,
              totalCards: subset.baseSetSize,
              isNumbered: subset.isNumbered || false,
              printRun: subset.printRun,
              isAutograph: subset.isAutograph || false,
              isRelic: subset.isRelic || false,
            })
            .returning();
          subsetId = newSubset.id;
        }

        log("seed", `  Subset "${subset.name}" (${subset.subsetType})`);

        // Upsert cards belonging to this subset
        if (subset.cards) {
          for (const card of subset.cards) {
            await db
              .insert(referenceCards)
              .values({
                setProductId,
                subsetId,
                cardNumber: card.cardNumber,
                playerName: card.playerName,
                team: card.team || null,
                isRookieCard: card.isRookieCard || false,
                isAutograph: card.isAutograph || false,
                isRelic: card.isRelic || false,
                isShortPrint: card.isShortPrint || false,
                position: card.position || null,
                jerseyNumber: card.jerseyNumber || null,
                printRun: card.printRun,
                notes: card.notes || null,
              })
              .onConflictDoUpdate({
                target: [referenceCards.setProductId, referenceCards.cardNumber],
                set: {
                  subsetId,
                  playerName: card.playerName,
                  team: card.team || null,
                  isRookieCard: card.isRookieCard || false,
                  isAutograph: card.isAutograph || false,
                  isRelic: card.isRelic || false,
                  isShortPrint: card.isShortPrint || false,
                  position: card.position || null,
                  jerseyNumber: card.jerseyNumber || null,
                  printRun: card.printRun,
                  notes: card.notes || null,
                },
              });
            cardsUpserted++;
          }
        }

        // Upsert parallel types scoped to this subset
        if (subset.parallels) {
          for (const parallel of subset.parallels) {
            const [existingParallel] = await db
              .select()
              .from(parallelTypes)
              .where(
                and(
                  eq(parallelTypes.setProductId, setProductId),
                  eq(parallelTypes.subsetId, subsetId),
                  eq(parallelTypes.name, parallel.name)
                )
              )
              .limit(1);

            if (existingParallel) {
              await db
                .update(parallelTypes)
                .set({
                  printRun: parallel.printRun ?? existingParallel.printRun,
                  serialNumbered: parallel.serialNumbered ?? existingParallel.serialNumbered,
                  colorFamily: parallel.colorFamily ?? existingParallel.colorFamily,
                  finishType: parallel.finishType ?? existingParallel.finishType,
                  exclusiveTo: parallel.exclusiveTo ?? existingParallel.exclusiveTo,
                  priceMultiplier: parallel.priceMultiplier ?? existingParallel.priceMultiplier,
                })
                .where(eq(parallelTypes.id, existingParallel.id));
            } else {
              await db
                .insert(parallelTypes)
                .values({
                  setProductId,
                  subsetId,
                  name: parallel.name,
                  printRun: parallel.printRun,
                  serialNumbered: parallel.serialNumbered || false,
                  colorFamily: parallel.colorFamily,
                  finishType: parallel.finishType,
                  exclusiveTo: parallel.exclusiveTo,
                  priceMultiplier: parallel.priceMultiplier,
                });
            }
            parallelsUpserted++;
          }
        }
      }
    }

    log("seed", `Seeded ${cardsUpserted} cards and ${parallelsUpserted} parallels for ${data.product.name} ${data.product.year}`);

    return {
      success: true,
      setProductId,
      cardsUpserted,
      parallelsUpserted,
    };
  } catch (err) {
    logError("seed", "Seed failed", err);
    return {
      success: false,
      setProductId: null,
      cardsUpserted: 0,
      parallelsUpserted: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
