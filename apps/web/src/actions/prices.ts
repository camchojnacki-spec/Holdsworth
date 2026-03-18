"use server";

import * as cheerio from "cheerio";

export interface EbaySoldListing {
  title: string;
  price: number;
  currency: string;
  dateSold: string;
  url: string;
  shippingPrice: number | null;
  condition: string | null;
}

export interface PriceLookupResult {
  success: boolean;
  query: string;
  listings: EbaySoldListing[];
  stats: {
    count: number;
    avgPrice: number;
    medianPrice: number;
    lowPrice: number;
    highPrice: number;
    avgPriceCad: number;
  } | null;
  error?: string;
}

/**
 * Build an eBay search query from card details.
 * Prioritizes specificity: player + year + set + card number + parallel
 */
function buildSearchQuery(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}): string {
  const parts: string[] = [];

  if (card.year) parts.push(String(card.year));
  if (card.manufacturer && card.setName && !card.setName.toLowerCase().includes(card.manufacturer.toLowerCase())) {
    parts.push(card.manufacturer);
  }
  if (card.setName) parts.push(card.setName);
  parts.push(card.playerName);
  if (card.cardNumber) parts.push(`#${card.cardNumber.replace(/^#/, "")}`);
  if (card.parallelVariant) parts.push(card.parallelVariant);
  if (card.graded && card.gradingCompany && card.grade) {
    parts.push(`${card.gradingCompany} ${card.grade}`);
  }

  return parts.join(" ");
}

/**
 * Scrape eBay sold/completed listings for a card.
 * Uses eBay's public search with LH_Sold=1&LH_Complete=1 filters.
 */
export async function lookupCardPrice(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}): Promise<PriceLookupResult> {
  const query = buildSearchQuery(card);

  try {
    // Search eBay sold listings — category 261328 = Sports Trading Cards
    const searchUrl = new URL("https://www.ebay.com/sch/i.html");
    searchUrl.searchParams.set("_nkw", query);
    searchUrl.searchParams.set("_sacat", "261328");
    searchUrl.searchParams.set("LH_Sold", "1");
    searchUrl.searchParams.set("LH_Complete", "1");
    searchUrl.searchParams.set("_sop", "13"); // Sort by end date: recent first
    searchUrl.searchParams.set("rt", "nc");
    searchUrl.searchParams.set("_ipg", "60"); // 60 results per page

    const response = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      return { success: false, query, listings: [], stats: null, error: `eBay returned ${response.status}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const listings: EbaySoldListing[] = [];

    // Parse each sold listing item
    $(".s-item").each((_, el) => {
      const $item = $(el);
      const title = $item.find(".s-item__title").text().trim();
      if (!title || title === "Shop on eBay") return;

      // Price — eBay shows sold price with strikethrough for the original and green for sold
      const priceText = $item.find(".s-item__price .POSITIVE").text().trim()
        || $item.find(".s-item__price").first().text().trim();

      // Extract numeric price
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (!priceMatch) return;
      const price = parseFloat(priceMatch[0].replace(/,/g, ""));
      if (isNaN(price) || price <= 0) return;

      // Currency detection
      const currency = priceText.includes("C $") || priceText.includes("CA$") ? "CAD" : "USD";

      // Date sold
      const dateSold = $item.find(".s-item__ended-date, .s-item__endedDate, .POSITIVE").last().text().trim();

      // Link
      const url = $item.find(".s-item__link").attr("href") || "";

      // Shipping
      const shippingText = $item.find(".s-item__shipping, .s-item__freeXDays").text().trim();
      let shippingPrice: number | null = null;
      if (shippingText.toLowerCase().includes("free")) {
        shippingPrice = 0;
      } else {
        const shipMatch = shippingText.match(/[\d,]+\.?\d*/);
        if (shipMatch) shippingPrice = parseFloat(shipMatch[0].replace(/,/g, ""));
      }

      // Condition
      const condition = $item.find(".SECONDARY_INFO").text().trim() || null;

      listings.push({ title, price, currency, dateSold, url: url.split("?")[0], shippingPrice, condition });
    });

    if (listings.length === 0) {
      return { success: true, query, listings: [], stats: null };
    }

    // Calculate stats
    const prices = listings.map((l) => l.price).sort((a, b) => a - b);
    const count = prices.length;
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / count;
    const medianPrice = count % 2 === 0
      ? (prices[count / 2 - 1] + prices[count / 2]) / 2
      : prices[Math.floor(count / 2)];

    // Rough USD→CAD conversion (will use live rates later)
    const usdToCad = 1.38;
    const avgPriceCad = avgPrice * usdToCad;

    return {
      success: true,
      query,
      listings,
      stats: {
        count,
        avgPrice: Math.round(avgPrice * 100) / 100,
        medianPrice: Math.round(medianPrice * 100) / 100,
        lowPrice: prices[0],
        highPrice: prices[count - 1],
        avgPriceCad: Math.round(avgPriceCad * 100) / 100,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price lookup failed";
    return { success: false, query, listings: [], stats: null, error: message };
  }
}
