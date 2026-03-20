"use server";

import {
  db,
  setProducts,
  referenceCards,
  parallelTypes,
  manufacturers,
  subsets,
} from "@holdsworth/db";
import { eq, and } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TcdbChecklistEntry {
  cardNumber: string;
  playerName: string;
  team: string;
  isRookieCard: boolean;
  subsetName: string | null;
}

interface ImportResult {
  success: boolean;
  setProductId: string | null;
  cardsUpserted: number;
  parallelsUpserted: number;
  error?: string;
}

// ─── TCDB scraper (web-side equivalent) ──────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractSetId(input: string): string | null {
  // Handle full URL
  const urlMatch = input.match(/sid\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  // Handle bare numeric ID
  if (/^\d+$/.test(input.trim())) return input.trim();
  return null;
}

async function scrapeTcdbChecklist(setId: string): Promise<{
  success: boolean;
  setId: string;
  url: string;
  entries: TcdbChecklistEntry[];
  error?: string;
}> {
  const url = `https://www.tcdb.com/ViewAll.cfm/sid/${setId}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.tcdb.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { success: false, setId, url, entries: [], error: `TCDB returned HTTP ${response.status}` };
    }

    const html = await response.text();

    // Lightweight HTML parsing — we avoid pulling in cheerio for the web bundle.
    // TCDB checklists have rows: <td>number</td><td>player</td><td>team</td>
    const entries: TcdbChecklistEntry[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Strip HTML tags from cell content
        cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
      }

      if (cells.length < 2) continue;

      const cardNumber = cells[0];
      const playerName = cells[1];

      // Skip header rows
      if (!cardNumber || !playerName) continue;
      if (cardNumber.toLowerCase() === "number" || cardNumber.toLowerCase() === "#" || cardNumber.toLowerCase() === "card #") continue;

      const team = cells.length >= 3 ? cells[2] : "";
      const isRookieCard = rowHtml.includes("RC") || rowHtml.includes("rookie");

      entries.push({
        cardNumber,
        playerName,
        team,
        isRookieCard,
        subsetName: null,
      });
    }

    return { success: true, setId, url, entries };
  } catch (err) {
    const message = err instanceof Error ? err.message : "TCDB scrape failed";
    return { success: false, setId, url, entries: [], error: message };
  }
}

// ─── Server Actions ──────────────────────────────────────────────────────────

export async function importFromTcdb(input: {
  url?: string;
  setId?: string;
  productName?: string;
  year?: number;
  manufacturer?: string;
}): Promise<ImportResult> {
  // Resolve set ID
  let resolvedSetId: string | null = null;
  if (input.setId) {
    resolvedSetId = extractSetId(input.setId);
  } else if (input.url) {
    resolvedSetId = extractSetId(input.url);
  }

  if (!resolvedSetId) {
    return { success: false, setProductId: null, cardsUpserted: 0, parallelsUpserted: 0, error: "Could not extract set ID from URL or input" };
  }

  // Scrape
  const scrapeResult = await scrapeTcdbChecklist(resolvedSetId);

  if (!scrapeResult.success || scrapeResult.entries.length === 0) {
    if (!input.productName || !input.year) {
      return {
        success: false,
        setProductId: null,
        cardsUpserted: 0,
        parallelsUpserted: 0,
        error: scrapeResult.error || "No checklist data found and no product overrides",
      };
    }
  }

  try {
    // Resolve manufacturer
    let manufacturerId: string | null = null;
    if (input.manufacturer) {
      const [mfr] = await db
        .select()
        .from(manufacturers)
        .where(eq(manufacturers.name, input.manufacturer))
        .limit(1);
      if (mfr) {
        manufacturerId = mfr.id;
      } else {
        const [newMfr] = await db
          .insert(manufacturers)
          .values({ name: input.manufacturer })
          .returning();
        manufacturerId = newMfr.id;
      }
    }

    // Upsert setProduct
    const productName = input.productName || `TCDB Set ${resolvedSetId}`;
    const productYear = input.year || new Date().getFullYear();

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
          ...(manufacturerId ? { manufacturerId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(setProducts.id, existingProduct.id));
    } else {
      const [newProduct] = await db
        .insert(setProducts)
        .values({
          name: productName,
          year: productYear,
          sport: "baseball",
          sourceUrl: scrapeResult.url,
          lastScrapedAt: new Date(),
          ...(manufacturerId ? { manufacturerId } : {}),
        })
        .returning();
      setProductId = newProduct.id;
    }

    // Upsert reference cards
    let cardsUpserted = 0;
    const subsetCache: Record<string, string> = {};

    for (const entry of scrapeResult.entries) {
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
              .values({ setProductId, name: entry.subsetName, subsetType: "insert" })
              .returning();
            subsetId = newSubset.id;
          }
          subsetCache[entry.subsetName] = subsetId;
        }
      }

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
    }

    return { success: true, setProductId, cardsUpserted, parallelsUpserted: 0 };
  } catch (err) {
    return {
      success: false,
      setProductId: null,
      cardsUpserted: 0,
      parallelsUpserted: 0,
      error: err instanceof Error ? err.message : "Import failed",
    };
  }
}

export async function manualAddSetProduct(data: {
  name: string;
  year: number;
  manufacturer: string;
  baseSetSize?: number;
  sport?: string;
  cards: Array<{
    cardNumber: string;
    playerName: string;
    team?: string;
    isRookieCard?: boolean;
  }>;
  parallels: Array<{
    name: string;
    printRun?: number;
    serialNumbered?: boolean;
    colorFamily?: string;
  }>;
}): Promise<ImportResult> {
  try {
    // Resolve manufacturer
    let manufacturerId: string | null = null;
    const [mfr] = await db
      .select()
      .from(manufacturers)
      .where(eq(manufacturers.name, data.manufacturer))
      .limit(1);
    if (mfr) {
      manufacturerId = mfr.id;
    } else {
      const [newMfr] = await db
        .insert(manufacturers)
        .values({ name: data.manufacturer })
        .returning();
      manufacturerId = newMfr.id;
    }

    // Upsert setProduct
    const [existingProduct] = await db
      .select()
      .from(setProducts)
      .where(and(eq(setProducts.name, data.name), eq(setProducts.year, data.year)))
      .limit(1);

    let setProductId: string;

    if (existingProduct) {
      setProductId = existingProduct.id;
      await db
        .update(setProducts)
        .set({
          baseSetSize: data.baseSetSize ?? existingProduct.baseSetSize,
          manufacturerId,
          updatedAt: new Date(),
        })
        .where(eq(setProducts.id, existingProduct.id));
    } else {
      const [newProduct] = await db
        .insert(setProducts)
        .values({
          name: data.name,
          year: data.year,
          sport: data.sport || "baseball",
          baseSetSize: data.baseSetSize,
          manufacturerId,
        })
        .returning();
      setProductId = newProduct.id;
    }

    // Upsert cards
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
        })
        .onConflictDoUpdate({
          target: [referenceCards.setProductId, referenceCards.cardNumber],
          set: {
            playerName: card.playerName,
            team: card.team || null,
            isRookieCard: card.isRookieCard || false,
          },
        });
      cardsUpserted++;
    }

    // Upsert parallels
    let parallelsUpserted = 0;
    for (const parallel of data.parallels) {
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
          });
      }
      parallelsUpserted++;
    }

    return { success: true, setProductId, cardsUpserted, parallelsUpserted };
  } catch (err) {
    return {
      success: false,
      setProductId: null,
      cardsUpserted: 0,
      parallelsUpserted: 0,
      error: err instanceof Error ? err.message : "Manual add failed",
    };
  }
}

export async function addParallelToSet(
  setProductId: string,
  parallelData: {
    name: string;
    printRun?: number;
    serialNumbered?: boolean;
    colorFamily?: string;
    finishType?: string;
    priceMultiplier?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const [existing] = await db
      .select()
      .from(parallelTypes)
      .where(and(eq(parallelTypes.setProductId, setProductId), eq(parallelTypes.name, parallelData.name)))
      .limit(1);

    if (existing) {
      await db
        .update(parallelTypes)
        .set({
          printRun: parallelData.printRun ?? existing.printRun,
          serialNumbered: parallelData.serialNumbered ?? existing.serialNumbered,
          colorFamily: parallelData.colorFamily ?? existing.colorFamily,
          finishType: parallelData.finishType ?? existing.finishType,
          priceMultiplier: parallelData.priceMultiplier ?? existing.priceMultiplier,
        })
        .where(eq(parallelTypes.id, existing.id));
    } else {
      await db.insert(parallelTypes).values({
        setProductId,
        name: parallelData.name,
        printRun: parallelData.printRun,
        serialNumbered: parallelData.serialNumbered || false,
        colorFamily: parallelData.colorFamily,
        finishType: parallelData.finishType,
        priceMultiplier: parallelData.priceMultiplier,
      });
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to add parallel" };
  }
}

export async function deleteSetProduct(setProductId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete in order: parallelTypes, referenceCards, subsets, then the setProduct itself
    await db.delete(parallelTypes).where(eq(parallelTypes.setProductId, setProductId));
    await db.delete(referenceCards).where(eq(referenceCards.setProductId, setProductId));
    await db.delete(subsets).where(eq(subsets.setProductId, setProductId));
    await db.delete(setProducts).where(eq(setProducts.id, setProductId));

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete set product" };
  }
}
