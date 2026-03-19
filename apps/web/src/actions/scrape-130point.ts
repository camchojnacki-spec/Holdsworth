"use server";

import * as cheerio from "cheerio";

export interface OneThirtyPointListing {
  title: string;
  price: number;
  date: string;
  url: string;
  imageUrl: string | null;
}

/**
 * Scrape 130point.com sold listings.
 * 130point aggregates eBay sold data and is a trusted source
 * in the card collecting community.
 *
 * Uses their POST API at back.130point.com/sales/
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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Origin: "https://130point.com",
        Referer: "https://130point.com/sales/",
      },
      body: new URLSearchParams({
        query: query,
        type: "1", // 1 = sold items
        subcat: "",
        tab_id: "1",
        tz: "America/Toronto",
        sort: "EndTimeSoonest",
      }).toString(),
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return { success: false, query, url: siteUrl, listings: [], error: `130point returned ${response.status}` };
    }

    const html = await response.text();

    // 130point returns HTML table rows
    const $ = cheerio.load(html);
    const listings: OneThirtyPointListing[] = [];

    // The response contains table rows with sold data
    $("tr").each((_, el) => {
      const $row = $(el);
      const cells = $row.find("td");
      if (cells.length < 3) return;

      // Try to extract title, price, date from cells
      const titleCell = cells.eq(0);
      const title = titleCell.find("a").text().trim() || titleCell.text().trim();
      if (!title) return;

      const itemUrl = titleCell.find("a").attr("href") || "";

      // Find price - look for cells with dollar amounts
      let price = 0;
      let date = "";
      const imageUrl = $row.find("img").attr("src") || null;

      cells.each((i, cell) => {
        const text = $(cell).text().trim();
        // Price detection - starts with $ or contains USD amount
        if (text.match(/^\$[\d,.]+/) && price === 0) {
          price = parseFloat(text.replace(/[^0-9.]/g, "")) || 0;
        }
        // Date detection
        if (text.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
          date = text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
        } else if (text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s*\d{4}\b/i)) {
          try {
            const d = new Date(text);
            if (!isNaN(d.getTime())) date = d.toISOString().split("T")[0];
          } catch { /* skip */ }
        }
      });

      if (price > 0 && title.length > 5) {
        listings.push({ title, price, date, url: itemUrl, imageUrl });
      }
    });

    // Also try parsing as JSON in case the API returns JSON
    if (listings.length === 0) {
      try {
        const data = JSON.parse(html);
        if (Array.isArray(data)) {
          for (const item of data) {
            const title = item.title || item.Title || "";
            const price = parseFloat(item.price || item.Price || item.currentPrice || "0");
            const date = item.endDate || item.date || item.EndDate || "";
            const itemUrl = item.url || item.viewItemURL || item.URL || "";
            const imageUrl = item.imageUrl || item.galleryURL || null;
            if (price > 0 && title) {
              listings.push({ title, price, date: date.split("T")[0], url: itemUrl, imageUrl });
            }
          }
        }
      } catch {
        // Not JSON — that's fine, we already tried HTML parsing
      }
    }

    return { success: true, query, url: siteUrl, listings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "130point scrape failed";
    return { success: false, query, url: siteUrl, listings: [], error: message };
  }
}
