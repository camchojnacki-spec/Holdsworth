"use server";

import * as cheerio from "cheerio";
import { chromium } from "playwright-core";

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
    // Use Playwright to render eBay pages — plain fetch gets blocked by bot detection
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      // If chromium binary not found, fall back to playwright's bundled browser
      const pw = await import("playwright");
      browser = await pw.chromium.launch({ headless: true });
    }
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      // Wait for search results to render
      await page.waitForSelector(".s-item", { timeout: 8000 }).catch(() => {});
    } catch {
      // Page might have loaded partially — try to parse what we got
    }

    const html = await page.content();
    await browser.close();

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
  const cardNum = card.cardNumber?.replace(/^#/, "") || "";

  // Query 1: Card number is the most precise identifier on eBay
  // e.g., "2025 Topps 90A-LAC Luisangel Acuna autograph"
  if (cardNum) {
    const parts: string[] = [];
    if (card.year) parts.push(String(card.year));
    if (card.manufacturer) parts.push(card.manufacturer);
    parts.push(cardNum);
    parts.push(playerName);
    if (autoTag) parts.push(autoTag);
    queries.push(parts.join(" "));
  }

  // Query 2: Year + set + player + insert + auto
  // e.g., "2025 Topps Series 1 Luisangel Acuna Real One Autograph"
  {
    const parts: string[] = [];
    if (card.year) parts.push(String(card.year));
    if (card.setName) parts.push(card.setName);
    parts.push(playerName);
    if (insertName && !card.setName?.toLowerCase().includes(insertName.toLowerCase())) {
      parts.push(insertName);
    }
    if (autoTag && !insertName.toLowerCase().includes("autograph")) {
      parts.push(autoTag);
    }
    if (card.parallelVariant) parts.push(card.parallelVariant);
    if (card.graded && card.gradingCompany && card.grade) {
      parts.push(`${card.gradingCompany} ${card.grade}`);
    }
    queries.push(parts.join(" "));
  }

  // Query 3: Year + manufacturer + player + card number
  // Drops set name in case it's wrong (e.g., "Topps Baseball" vs "Topps Series 1")
  if (cardNum) {
    const parts: string[] = [];
    if (card.year) parts.push(String(card.year));
    if (card.manufacturer) parts.push(card.manufacturer);
    parts.push(playerName);
    parts.push(`#${cardNum}`);
    if (autoTag) parts.push(autoTag);
    queries.push(parts.join(" "));
  }

  // Query 4: Year + manufacturer + player + auto
  // e.g., "2025 Topps Luisangel Acuna autograph"
  {
    const parts: string[] = [];
    if (card.year) parts.push(String(card.year));
    if (card.manufacturer) parts.push(card.manufacturer);
    parts.push(playerName);
    if (autoTag) parts.push(autoTag);
    if (card.parallelVariant) parts.push(card.parallelVariant);
    queries.push(parts.join(" "));
  }

  // Deduplicate
  return [...new Set(queries)];
}
