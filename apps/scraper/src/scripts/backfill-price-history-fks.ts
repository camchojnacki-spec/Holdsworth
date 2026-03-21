/**
 * Backfill priceHistory reference FKs from existing card data.
 *
 * Joins priceHistory -> cards -> referenceCards to populate:
 * - referenceCardId (from cards.referenceCardId)
 * - setProductId (from referenceCards.setProductId)
 * - parallelTypeId (by matching cards.parallelVariant against parallelTypes.name)
 *
 * Usage: pnpm --filter scraper exec tsx src/scripts/backfill-price-history-fks.ts
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env before DB module initializes
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

const { db, priceHistory, cards, referenceCards, parallelTypes } = await import("@holdsworth/db");
const { eq, and, sql, isNull, isNotNull } = await import("drizzle-orm");

async function main() {
  // Step 1: Backfill referenceCardId and setProductId from cards table
  console.log("Backfilling referenceCardId and setProductId...");

  const unlinked = await db
    .select({
      phId: priceHistory.id,
      cardId: priceHistory.cardId,
      cardRefId: cards.referenceCardId,
      parallelVariant: cards.parallelVariant,
    })
    .from(priceHistory)
    .innerJoin(cards, eq(priceHistory.cardId, cards.id))
    .where(
      and(
        isNull(priceHistory.referenceCardId),
        isNotNull(cards.referenceCardId)
      )
    );

  console.log(`Found ${unlinked.length} priceHistory rows to backfill`);

  let updated = 0;
  for (const row of unlinked) {
    if (!row.cardRefId) continue;

    // Get setProductId from referenceCard
    const [refCard] = await db
      .select({ setProductId: referenceCards.setProductId })
      .from(referenceCards)
      .where(eq(referenceCards.id, row.cardRefId))
      .limit(1);

    if (!refCard) continue;

    // Try to resolve parallelTypeId
    let parallelTypeId: string | null = null;
    if (row.parallelVariant && !["base", "base card", ""].includes(row.parallelVariant.toLowerCase())) {
      const variantLower = row.parallelVariant.toLowerCase();
      const parallels = await db
        .select({ id: parallelTypes.id, name: parallelTypes.name })
        .from(parallelTypes)
        .where(eq(parallelTypes.setProductId, refCard.setProductId));

      const match = parallels.find((p) => {
        const pName = p.name.toLowerCase();
        return pName.includes(variantLower) || variantLower.includes(pName.replace(/\s*\/\s*\d+$/, "").trim());
      });

      if (match) parallelTypeId = match.id;
    }

    await db
      .update(priceHistory)
      .set({
        referenceCardId: row.cardRefId,
        setProductId: refCard.setProductId,
        ...(parallelTypeId ? { parallelTypeId } : {}),
      })
      .where(eq(priceHistory.id, row.phId));

    updated++;
  }

  console.log(`Updated ${updated} priceHistory rows`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
