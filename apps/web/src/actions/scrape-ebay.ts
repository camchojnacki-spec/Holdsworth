"use server";

import * as cheerio from "cheerio";

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
 * Build an eBay sold listings search URL.
 * Category 212 = Sports Trading Cards
 */
function buildEbayUrl(query: string): string {
  const params = new URLSearchParams({
    _nkw: query,
    LH_Sold: "1",
    LH_Complete: "1",
    _sacat: "212",
    _sop: "13", // Sort by end date: recent first
    _ipg: "60", // 60 results per page
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

/**
 * Parse a price string like "$6.50" or "C $8.99" into a number.
 */
function parsePrice(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Parse an eBay date string like "Sold Mar 15, 2026" or "Sold 3/15/2026".
 */
function parseDate(text: string): string {
  const cleaned = text.replace(/^Sold\s*/i, "").trim();
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {
    // fallback
  }
  return cleaned;
}

/**
 * Scrape eBay sold listings for a card.
 * Uses fetch + cheerio (no browser needed for eBay search results).
 */
export async function scrapeEbaySold(query: string): Promise<{
  success: boolean;
  query: string;
  url: string;
  listings: EbaySoldListing[];
  error?: string;
}> {
  const url = buildEbayUrl(query);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return { success: false, query, url, listings: [], error: `eBay returned ${response.status}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const listings: EbaySoldListing[] = [];

    // eBay uses .s-item for each listing result
    $(".s-item").each((_, el) => {
      const $item = $(el);

      // Skip the first "ghost" item eBay sometimes includes
      const title = $item.find(".s-item__title").first().text().trim();
      if (!title || title === "Shop on eBay" || title === "Results matching fewer words") return;

      // Price
      const priceText = $item.find(".s-item__price").first().text().trim();
      const price = parsePrice(priceText);
      if (price === 0) return; // Skip items with no price

      // Shipping
      const shippingText = $item.find(".s-item__shipping, .s-item__freeXDays").first().text().trim();
      let shippingPrice: number | null = null;
      if (shippingText.toLowerCase().includes("free")) {
        shippingPrice = 0;
      } else if (shippingText) {
        shippingPrice = parsePrice(shippingText);
      }

      // Sold date
      const soldText = $item.find(".s-item__title--tag .POSITIVE, .s-item__ended-date, .s-item__endedDate").first().text().trim();
      // Also try the caption/subtitle area
      const captionText = $item.find(".s-item__caption").text().trim();
      const dateSource = soldText || captionText;
      const date = dateSource ? parseDate(dateSource) : "";

      // URL
      const itemUrl = $item.find(".s-item__link").attr("href") || "";
      // Clean tracking params from URL
      const cleanUrl = itemUrl.split("?")[0];

      // Image
      const imageUrl = $item.find(".s-item__image-wrapper img").attr("src") || null;

      // Condition
      const condition = $item.find(".SECONDARY_INFO").first().text().trim() || null;

      listings.push({
        title,
        price,
        shippingPrice,
        date,
        url: cleanUrl,
        imageUrl,
        condition,
      });
    });

    return { success: true, query, url, listings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "eBay scrape failed";
    return { success: false, query, url, listings: [], error: message };
  }
}

/**
 * Build search queries for a card, from most specific to broadest.
 * Returns multiple queries to try in order.
 */
export function buildEbayQueries(card: {
  playerName: string;
  year?: number | null;
  setName?: string | null;
  cardNumber?: string | null;
  parallelVariant?: string | null;
  manufacturer?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}): string[] {
  const queries: string[] = [];

  // Remove accents for eBay search compatibility
  const playerName = card.playerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Query 1: Most specific — year + set + player + variant
  const parts1: string[] = [];
  if (card.year) parts1.push(String(card.year));
  if (card.setName) parts1.push(card.setName);
  parts1.push(playerName);
  if (card.parallelVariant) parts1.push(card.parallelVariant);
  if (card.graded && card.gradingCompany && card.grade) {
    parts1.push(`${card.gradingCompany} ${card.grade}`);
  }
  queries.push(parts1.join(" "));

  // Query 2: Year + set + player + card number (no variant name, use number instead)
  if (card.cardNumber) {
    const parts2: string[] = [];
    if (card.year) parts2.push(String(card.year));
    if (card.setName) parts2.push(card.setName);
    parts2.push(playerName);
    parts2.push(`#${card.cardNumber.replace(/^#/, "")}`);
    queries.push(parts2.join(" "));
  }

  // Query 3: Broader — year + manufacturer + player + variant
  const parts3: string[] = [];
  if (card.year) parts3.push(String(card.year));
  if (card.manufacturer) parts3.push(card.manufacturer);
  parts3.push(playerName);
  if (card.parallelVariant) parts3.push(card.parallelVariant);
  queries.push(parts3.join(" "));

  // Deduplicate
  return [...new Set(queries)];
}
