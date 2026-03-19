"use server";

/**
 * eBay search query builder.
 * The actual eBay scraping via Playwright is removed because eBay blocks
 * headless browsers. Use 130point (scrape-130point.ts) for sold data
 * and the eBay Browse API (scrape-ebay-api.ts) for active listings.
 */

export interface EbaySoldListing {
  title: string;
  price: number;
  shippingPrice: number | null;
  date: string;
  url: string;
  imageUrl: string | null;
  condition: string | null;
}

/**
 * Build optimized eBay search queries for a card.
 * Returns multiple query variants ordered from most specific to broadest.
 */
export async function buildEbayQueries(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
  isAutograph?: boolean;
  subsetOrInsert?: string | null;
}): Promise<string[]> {
  const queries: string[] = [];

  // Remove accents for eBay search compatibility
  const playerName = card.playerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const autoTag = card.isAutograph ? "autograph" : "";
  const insertName = card.subsetOrInsert || "";

  // Most specific: card number + player + auto
  if (card.cardNumber) {
    queries.push(
      [card.year, card.manufacturer || "Topps", card.cardNumber, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // With set name + auto
  queries.push(
    [card.year, card.setName, playerName, autoTag]
      .filter(Boolean).join(" ")
  );

  // With insert set name
  if (insertName) {
    queries.push(
      [card.year, insertName, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // Broadest: just year + player + auto
  queries.push(
    [card.year, playerName, autoTag, card.manufacturer || "Topps"]
      .filter(Boolean).join(" ")
  );

  return queries;
}

/**
 * Stub — eBay direct scraping is disabled (bot detection).
 * Use 130point for sold data instead.
 */
export async function scrapeEbaySold(query: string): Promise<{
  success: boolean;
  query: string;
  url: string;
  listings: EbaySoldListing[];
  error?: string;
}> {
  const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=213&LH_Complete=1&LH_Sold=1&_sop=13`;
  return {
    success: false,
    query,
    url,
    listings: [],
    error: "eBay direct scraping disabled — using 130point and eBay API instead",
  };
}
