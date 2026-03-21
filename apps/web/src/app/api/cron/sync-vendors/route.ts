import { NextRequest, NextResponse } from "next/server";
import { db, vendors, vendorProducts, vendorPriceHistory, setProducts, notifications } from "@holdsworth/db";
import { eq, and, sql, isNull } from "drizzle-orm";

/**
 * POST /api/cron/sync-vendors
 *
 * Daily cron job that scrapes card retail websites for product availability.
 * Phase 1: Supports Shopify-based vendors (products.json endpoint).
 * Future: Custom scrapers for non-Shopify vendors.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = {
      vendorsScraped: 0,
      productsUpserted: 0,
      priceChanges: 0,
      productsResolved: 0,
      errors: [] as string[],
    };

    // Get all active vendors
    const allVendors = await db.select().from(vendors);

    for (const vendor of allVendors) {
      try {
        // Determine scraper type based on vendor
        const products = await scrapeShopifyVendor(vendor.websiteUrl);
        results.vendorsScraped++;

        for (const product of products) {
          try {
            // Upsert vendor product
            const [existing] = await db
              .select()
              .from(vendorProducts)
              .where(
                and(
                  eq(vendorProducts.vendorId, vendor.id),
                  eq(vendorProducts.productUrl, product.url)
                )
              )
              .limit(1);

            if (existing) {
              // Update price and stock
              const priceChanged = existing.priceUsd !== product.priceUsd;

              await db
                .update(vendorProducts)
                .set({
                  priceUsd: product.priceUsd,
                  inStock: product.inStock,
                  lastChecked: new Date(),
                })
                .where(eq(vendorProducts.id, existing.id));

              if (priceChanged) {
                // Track price change
                await db.insert(vendorPriceHistory).values({
                  vendorProductId: existing.id,
                  priceCad: product.priceUsd, // TODO: convert via currencyRates
                  inStock: product.inStock,
                });
                results.priceChanges++;
              }
            } else {
              // Insert new product
              await db.insert(vendorProducts).values({
                vendorId: vendor.id,
                productName: product.name,
                productUrl: product.url,
                productType: product.productType,
                sport: "baseball",
                year: product.year,
                setName: product.setName,
                priceUsd: product.priceUsd,
                inStock: product.inStock,
                lastChecked: new Date(),
              });
            }

            results.productsUpserted++;
          } catch (err) {
            results.errors.push(`Product ${product.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        results.errors.push(`Vendor ${vendor.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Resolve unlinked products to setProducts ──
    const unlinked = await db
      .select()
      .from(vendorProducts)
      .where(isNull(vendorProducts.setProductId))
      .limit(50);

    for (const vp of unlinked) {
      try {
        const resolved = await resolveVendorProduct(vp);
        if (resolved) {
          await db
            .update(vendorProducts)
            .set({ setProductId: resolved })
            .where(eq(vendorProducts.id, vp.id));
          results.productsResolved++;
        }
      } catch {}
    }

    if (results.productsUpserted > 0) {
      await db.insert(notifications).values({
        type: "system",
        title: "Vendor Sync Complete",
        message: `Scraped ${results.vendorsScraped} vendors, ${results.productsUpserted} products updated, ${results.priceChanges} price changes, ${results.productsResolved} resolved to sets.`,
      });
    }

    return NextResponse.json({
      ok: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Scrape a Shopify-based vendor using their /products.json endpoint.
 */
async function scrapeShopifyVendor(baseUrl: string): Promise<Array<{
  name: string;
  url: string;
  priceUsd: string;
  inStock: boolean;
  productType: string | null;
  year: number | null;
  setName: string | null;
}>> {
  const products: Array<{
    name: string;
    url: string;
    priceUsd: string;
    inStock: boolean;
    productType: string | null;
    year: number | null;
    setName: string | null;
  }> = [];

  // Shopify exposes products.json - paginate through
  let page = 1;
  const maxPages = 5; // Cap to avoid hammering

  while (page <= maxPages) {
    try {
      const url = `${baseUrl.replace(/\/$/, "")}/products.json?page=${page}&limit=250`;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Holdsworth/1.0)" },
      });

      if (!response.ok) break;

      const data = await response.json();
      if (!data.products || data.products.length === 0) break;

      for (const p of data.products) {
        // Filter to card-related products
        const title = (p.title || "").toLowerCase();
        if (!isCardProduct(title)) continue;

        const variant = p.variants?.[0];
        if (!variant) continue;

        const parsed = parseProductName(p.title);

        products.push({
          name: p.title,
          url: `${baseUrl.replace(/\/$/, "")}/products/${p.handle}`,
          priceUsd: String(variant.price || "0"),
          inStock: variant.available ?? true,
          productType: parsed.productType,
          year: parsed.year,
          setName: parsed.setName,
        });
      }

      page++;
      // Rate limit
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      break;
    }
  }

  return products;
}

function isCardProduct(title: string): boolean {
  const keywords = ["hobby", "retail", "blaster", "mega box", "hanger", "fat pack", "cello", "value pack", "jumbo"];
  const sports = ["baseball", "topps", "bowman", "panini", "upper deck"];
  return keywords.some((k) => title.includes(k)) || sports.some((s) => title.includes(s));
}

function parseProductName(name: string): {
  year: number | null;
  setName: string | null;
  productType: string | null;
} {
  // Extract year (4-digit number between 2020-2030)
  const yearMatch = name.match(/\b(202[0-9]|2030)\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Detect product type
  const typeLower = name.toLowerCase();
  let productType: string | null = null;
  if (typeLower.includes("hobby")) productType = "hobby_box";
  else if (typeLower.includes("blaster")) productType = "blaster";
  else if (typeLower.includes("mega")) productType = "mega_box";
  else if (typeLower.includes("hanger")) productType = "hanger";
  else if (typeLower.includes("fat pack")) productType = "fat_pack";
  else if (typeLower.includes("cello")) productType = "cello";
  else if (typeLower.includes("value pack")) productType = "value_pack";
  else if (typeLower.includes("retail")) productType = "retail_box";

  // Extract set name (remove year, product type, and common suffixes)
  let setName = name
    .replace(/\b(202[0-9]|2030)\b/, "")
    .replace(/\b(hobby|retail|blaster|mega|hanger|fat pack|cello|value pack|jumbo|box|case|pack)\b/gi, "")
    .replace(/\b(baseball|football|basketball|hockey|soccer)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { year, setName: setName || null, productType };
}

/**
 * Try to resolve a vendorProduct to a setProduct by fuzzy matching name + year.
 */
async function resolveVendorProduct(vp: typeof vendorProducts.$inferSelect): Promise<string | null> {
  if (!vp.year && !vp.setName) return null;

  // Try exact match first
  const conditions = [];
  if (vp.year) conditions.push(eq(setProducts.year, vp.year));

  const candidates = await db
    .select({ id: setProducts.id, name: setProducts.name, year: setProducts.year })
    .from(setProducts)
    .where(vp.year ? eq(setProducts.year, vp.year) : sql`1=1`)
    .limit(50);

  if (candidates.length === 0) return null;

  // Score candidates against vendor product name
  const productNameLower = vp.productName.toLowerCase();
  let bestMatch: { id: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateName = candidate.name.toLowerCase();
    let score = 0;

    // Check each word of candidate name appears in product name
    const words = candidateName.split(/\s+/);
    for (const word of words) {
      if (word.length >= 3 && productNameLower.includes(word)) {
        score += 10;
      }
    }

    // Year match bonus
    if (candidate.year === vp.year) score += 20;

    if (score > (bestMatch?.score ?? 0) && score >= 30) {
      bestMatch = { id: candidate.id, score };
    }
  }

  return bestMatch?.id ?? null;
}
