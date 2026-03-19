"use server";

import { chromium } from "playwright";

export interface SoldListing {
  title: string;
  price: number;
  currency: string;
  dateSold: string;
  url: string;
  shippingPrice: number | null;
  source: string;
}

export interface PriceLookupResult {
  success: boolean;
  query: string;
  listings: SoldListing[];
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
 * Scrape eBay sold listings using Playwright headless browser.
 */
async function scrapeEbaySold(query: string): Promise<SoldListing[]> {
  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=261328&LH_Sold=1&LH_Complete=1&_sop=13&rt=nc&_ipg=60`;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    // Wait for results to load
    await page.waitForSelector(".s-item", { timeout: 8000 }).catch(() => {});

    const listings = await page.evaluate(() => {
      const items: {
        title: string;
        price: number;
        currency: string;
        dateSold: string;
        url: string;
        shippingPrice: number | null;
      }[] = [];

      document.querySelectorAll(".s-item").forEach((el) => {
        const titleEl = el.querySelector(".s-item__title");
        const title = titleEl?.textContent?.trim() || "";
        if (!title || title === "Shop on eBay") return;

        // Get sold price (green text)
        const priceEl = el.querySelector(".s-item__price .POSITIVE") || el.querySelector(".s-item__price");
        const priceText = priceEl?.textContent?.trim() || "";
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (!priceMatch) return;
        const price = parseFloat(priceMatch[0].replace(/,/g, ""));
        if (isNaN(price) || price <= 0) return;

        const currency = priceText.includes("C $") || priceText.includes("CA$") ? "CAD" : "USD";

        // Date sold
        const dateEl = el.querySelector(".s-item__title--tag .POSITIVE, .s-item__ended-date");
        const dateSold = dateEl?.textContent?.trim() || "";

        // URL
        const linkEl = el.querySelector<HTMLAnchorElement>(".s-item__link");
        const url = linkEl?.href?.split("?")[0] || "";

        // Shipping
        const shipEl = el.querySelector(".s-item__shipping, .s-item__freeXDays");
        const shipText = shipEl?.textContent?.trim() || "";
        let shippingPrice: number | null = null;
        if (shipText.toLowerCase().includes("free")) {
          shippingPrice = 0;
        } else {
          const shipMatch = shipText.match(/[\d,]+\.?\d*/);
          if (shipMatch) shippingPrice = parseFloat(shipMatch[0].replace(/,/g, ""));
        }

        items.push({ title, price, currency, dateSold, url, shippingPrice });
      });

      return items;
    });

    return listings.map((l) => ({ ...l, source: "ebay" }));
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Look up card prices from eBay sold listings.
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
    const listings = await scrapeEbaySold(query);

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

    // Rough USD→CAD (will use live rates later)
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
