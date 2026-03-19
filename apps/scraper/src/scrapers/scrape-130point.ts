import * as cheerio from "cheerio";
import { log } from "../lib/logger";

export interface OneThirtyPointListing {
  title: string;
  price: number;
  date: string;
  url: string;
  imageUrl: string | null;
  saleType: string | null; // "best_offer" if detected, null otherwise
}

/**
 * Scrape 130point.com sold listings via their POST API.
 * Returns real eBay sold data with prices, dates, and listing URLs.
 */
export async function scrape130Point(query: string): Promise<{
  success: boolean;
  query: string;
  url: string;
  listings: OneThirtyPointListing[];
  error?: string;
}> {
  const siteUrl = `https://130point.com/sales/?search=${encodeURIComponent(query)}`;

  try {
    const response = await fetch("https://back.130point.com/sales/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Origin: "https://130point.com",
        Referer: "https://130point.com/sales/",
      },
      body: new URLSearchParams({
        query,
        type: "1",
        subcat: "",
        tab_id: "1",
        tz: "America/Toronto",
        sort: "EndTimeSoonest",
      }).toString(),
    });

    if (!response.ok) {
      return { success: false, query, url: siteUrl, listings: [], error: `130point returned ${response.status}` };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const listings: OneThirtyPointListing[] = [];

    $("tr[data-price]").each((_, el) => {
      const $row = $(el);
      const price = parseFloat($row.attr("data-price") || "0");
      if (price === 0) return;

      const titleLink = $row.find("#titleText a, span#titleText a").first();
      const title = titleLink.text().trim();
      if (!title) return;

      const itemUrl = titleLink.attr("href") || "";

      const dateText = $row.find("#dateText").text().replace(/^Date:\s*/i, "").trim();
      let date = "";
      if (dateText) {
        try {
          const d = new Date(dateText);
          if (!isNaN(d.getTime())) date = d.toISOString().split("T")[0];
        } catch { /* skip malformed dates */ }
      }

      const imageUrl = $row.find("#imgCol img").first().attr("src") || null;

      // Detect best offer accepted — check the auctionLabel element and props-data
      const auctionLabel = $row.find("#auctionLabel").text().trim().toLowerCase();
      const propsData = $row.find(".props-data").text();
      const bestOfferPriceMatch = propsData.match(/Best Offer Price:\s*([\d.]+)/);
      const bestOfferPrice = bestOfferPriceMatch ? parseFloat(bestOfferPriceMatch[1]) : 0;
      // It's a best offer if: the label says so, OR the best offer price > 0 and differs from sale price
      const isBestOffer = auctionLabel.includes("best offer") ||
        (bestOfferPrice > 0 && Math.abs(bestOfferPrice - price) > 0.01);
      const saleType = isBestOffer ? "best_offer" : null;

      listings.push({ title, price, date, url: itemUrl, imageUrl, saleType });
    });

    log("130point", `Parsed ${listings.length} listings`, { query });
    return { success: true, query, url: siteUrl, listings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "130point scrape failed";
    return { success: false, query, url: siteUrl, listings: [], error: message };
  }
}
