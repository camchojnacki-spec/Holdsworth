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
 * Scrape 130point.com sold listings via their POST API.
 * 130point returns HTML with DataTables rows containing eBay sold data.
 *
 * Row structure: <tr id="dRow" data-price="14.99" data-currency="USD">
 *   <td id="imgCol"> ... image ... </td>
 *   <td id="dCol"> ... title link, price, date, shipping ... </td>
 * </tr>
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
        query: query,
        type: "1", // 1 = sold items
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

    // 130point uses <tr id="dRow" data-price="XX.XX"> for each listing
    $("tr[data-price]").each((_, el) => {
      const $row = $(el);

      // Price from data attribute
      const price = parseFloat($row.attr("data-price") || "0");
      if (price === 0) return;

      // Title from the link in #titleText span
      const titleLink = $row.find("#titleText a, span#titleText a").first();
      const title = titleLink.text().trim();
      if (!title) return;

      // URL from the eBay link
      const itemUrl = titleLink.attr("href") || "";

      // Date from #dateText span
      const dateText = $row.find("#dateText").text().replace(/^Date:\s*/i, "").trim();
      let date = "";
      if (dateText) {
        try {
          const d = new Date(dateText);
          if (!isNaN(d.getTime())) date = d.toISOString().split("T")[0];
        } catch { /* skip */ }
      }

      // Image
      const imageUrl = $row.find("#imgCol img").first().attr("src") || null;

      listings.push({ title, price, date, url: itemUrl, imageUrl });
    });

    console.log(`[130point] Parsed ${listings.length} listings from response`);
    return { success: true, query, url: siteUrl, listings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "130point scrape failed";
    return { success: false, query, url: siteUrl, listings: [], error: message };
  }
}
