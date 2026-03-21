import { NextRequest, NextResponse } from "next/server";
import { db, setProducts, setImportAttempts, notifications } from "@holdsworth/db";
import { eq, and, lt, or, sql, ne } from "drizzle-orm";

/**
 * POST /api/cron/sync-checklists
 *
 * Daily cron job that auto-expands the reference database:
 * 1. Discovers new products from TCDB for current + previous year
 * 2. Re-scrapes existing products older than 30 days
 * 3. Logs failures to set_import_attempts to prevent retry storms
 *
 * Rate limited: 3-second delay between TCDB requests.
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
    const currentYear = new Date().getFullYear();
    const results = {
      productsDiscovered: 0,
      productsImported: 0,
      productsRefreshed: 0,
      errors: [] as string[],
    };

    // ── Phase 1: Discover new products ──
    for (const year of [currentYear, currentYear - 1]) {
      try {
        const discovered = await discoverTcdbProducts(year);
        results.productsDiscovered += discovered.length;

        for (const product of discovered) {
          if (product.alreadyImported) continue;

          // Check if we've already tried and failed
          const [existing] = await db
            .select()
            .from(setImportAttempts)
            .where(
              and(
                eq(setImportAttempts.setName, product.name),
                eq(setImportAttempts.year, year),
                eq(setImportAttempts.status, "not_found")
              )
            )
            .limit(1);

          if (existing) continue; // Skip known failures

          try {
            // Dynamic import to avoid circular dependencies
            const { importFromTcdb } = await import("@/actions/reference-import");
            const result = await importFromTcdb({ setId: product.tcdbId });

            if (result.success) {
              results.productsImported++;
              // Log success
              await db.insert(setImportAttempts).values({
                setName: product.name,
                year,
                tcdbUrl: `https://www.tcdb.com/ViewAll.cfm/sid/${product.tcdbId}`,
                status: "imported",
              });
            } else {
              // Log failure
              await db.insert(setImportAttempts).values({
                setName: product.name,
                year,
                tcdbUrl: `https://www.tcdb.com/ViewAll.cfm/sid/${product.tcdbId}`,
                status: "parse_error",
                errorMessage: result.error,
              });
            }
          } catch (err) {
            results.errors.push(`Import ${product.name}: ${err instanceof Error ? err.message : String(err)}`);
          }

          // Rate limit: 3 second delay between TCDB requests
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (err) {
        results.errors.push(`Year ${year}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Phase 2: Refresh stale products ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleProducts = await db
      .select({ id: setProducts.id, name: setProducts.name, sourceUrl: setProducts.sourceUrl })
      .from(setProducts)
      .where(
        and(
          or(
            lt(setProducts.lastScrapedAt, thirtyDaysAgo),
            sql`${setProducts.lastScrapedAt} IS NULL`
          ),
          sql`${setProducts.sourceUrl} IS NOT NULL`
        )
      )
      .limit(10); // Cap at 10 per run to avoid timeouts

    for (const product of staleProducts) {
      try {
        // Extract TCDB ID from sourceUrl
        const match = product.sourceUrl?.match(/sid\/(\d+)/);
        if (!match) continue;

        const { importFromTcdb } = await import("@/actions/reference-import");
        await importFromTcdb({ setId: match[1] });
        results.productsRefreshed++;

        await new Promise((r) => setTimeout(r, 3000));
      } catch (err) {
        results.errors.push(`Refresh ${product.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Log summary notification ──
    if (results.productsImported > 0 || results.productsRefreshed > 0) {
      await db.insert(notifications).values({
        type: "system",
        title: "Reference DB Auto-Sync",
        message: `Discovered ${results.productsDiscovered} products, imported ${results.productsImported} new, refreshed ${results.productsRefreshed} stale.${results.errors.length > 0 ? ` ${results.errors.length} errors.` : ""}`,
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
 * Discover TCDB products for a given year.
 * Parses the TCDB year index page to find product IDs.
 */
async function discoverTcdbProducts(year: number): Promise<Array<{
  tcdbId: string;
  name: string;
  alreadyImported: boolean;
}>> {
  const url = `https://www.tcdb.com/ViewAll.cfm/sp/Baseball/year/${year}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Holdsworth/1.0)",
      },
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Parse product links from the index page
    // TCDB format: <a href="/ViewAll.cfm/sid/12345">Product Name</a>
    const products: Array<{ tcdbId: string; name: string; alreadyImported: boolean }> = [];
    const linkRegex = /href="\/ViewAll\.cfm\/sid\/(\d+)[^"]*"[^>]*>([^<]+)</gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const tcdbId = match[1];
      const name = match[2].trim();

      // Skip non-card products (stickers, magazines, etc.)
      if (name.toLowerCase().includes("sticker") || name.toLowerCase().includes("magazine")) continue;

      // Check if already in our DB
      const [existing] = await db
        .select({ id: setProducts.id })
        .from(setProducts)
        .where(and(eq(setProducts.name, name), eq(setProducts.year, year)))
        .limit(1);

      products.push({
        tcdbId,
        name,
        alreadyImported: !!existing,
      });
    }

    return products;
  } catch {
    return [];
  }
}
