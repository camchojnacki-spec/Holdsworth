import * as cheerio from "cheerio";
import { log, logError } from "../lib/logger";

export interface TcdbChecklistEntry {
  cardNumber: string;
  playerName: string;
  team: string;
  isRookieCard: boolean;
  subsetName: string | null;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Rate-limit: wait at least 2 seconds between requests */
let lastRequestTime = 0;
async function politeDelay() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 2000) {
    await new Promise((r) => setTimeout(r, 2000 - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Scrape a TCDB checklist page for card data.
 *
 * TCDB checklist URLs follow patterns like:
 *   https://www.tcdb.com/ViewAll.cfm/sid/{setId}
 *
 * The page contains an HTML table with card numbers, player names, and teams.
 */
export async function scrapeTcdbChecklist(
  setId: string
): Promise<{
  success: boolean;
  setId: string;
  url: string;
  entries: TcdbChecklistEntry[];
  error?: string;
}> {
  const url = `https://www.tcdb.com/ViewAll.cfm/sid/${setId}`;

  try {
    await politeDelay();

    log("tcdb", `Fetching checklist: ${url}`, { setId });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.tcdb.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        success: false,
        setId,
        url,
        entries: [],
        error: `TCDB returned HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const entries: TcdbChecklistEntry[] = [];

    // TCDB renders checklists in table rows.
    // Each row typically has: card number, player name, team, and possibly a subset header.
    let currentSubset: string | null = null;

    // Look for the main checklist table
    $("table.checklist tr, table#clist tr, table tr").each((_, el) => {
      const $row = $(el);

      // Detect subset header rows (typically span multiple columns)
      const headerCell = $row.find("td[colspan], th[colspan]");
      if (headerCell.length > 0 && $row.find("td").length <= 2) {
        const headerText = headerCell.text().trim();
        if (headerText && !headerText.includes("Card #") && !headerText.includes("Number")) {
          currentSubset = headerText;
        }
        return;
      }

      // Parse data rows — look for cells with card data
      const cells = $row.find("td");
      if (cells.length < 2) return;

      // Try different column layouts TCDB uses
      const cardNumber = $(cells[0]).text().trim();
      const playerName = $(cells[1]).text().trim();

      // Card number should look like a number or alphanumeric code
      if (!cardNumber || !playerName) return;
      if (cardNumber.toLowerCase() === "number" || cardNumber.toLowerCase() === "#") return;

      // Team is usually in column 3 or embedded in the player cell
      const team = cells.length >= 3 ? $(cells[2]).text().trim() : "";

      // Detect rookie cards — TCDB marks them with "RC" or a special class
      const rowHtml = $row.html() || "";
      const isRookieCard =
        rowHtml.includes("RC") ||
        $row.hasClass("rc") ||
        $row.find(".rc, .rookie").length > 0;

      entries.push({
        cardNumber,
        playerName,
        team,
        isRookieCard,
        subsetName: currentSubset,
      });
    });

    log("tcdb", `Parsed ${entries.length} entries from checklist`, { setId });
    return { success: true, setId, url, entries };
  } catch (err) {
    const message = err instanceof Error ? err.message : "TCDB scrape failed";
    logError("tcdb", `Failed to scrape checklist`, err);
    return { success: false, setId, url, entries: [], error: message };
  }
}

/**
 * Search TCDB for a set by name and year to find the set ID.
 * Returns the first matching set ID, or null if not found.
 */
export async function searchTcdbSet(
  name: string,
  year: number
): Promise<string | null> {
  try {
    await politeDelay();

    const query = `${year} ${name}`;
    const searchUrl = `https://www.tcdb.com/Search.cfm/search/${encodeURIComponent(query)}/type/set`;

    log("tcdb", `Searching for set: "${query}"`, { searchUrl });

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.tcdb.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for set links in search results
    const setLink = $('a[href*="/ViewAll.cfm/sid/"]').first();
    if (setLink.length > 0) {
      const href = setLink.attr("href") || "";
      const match = href.match(/sid\/(\d+)/);
      if (match) {
        log("tcdb", `Found set ID: ${match[1]}`);
        return match[1];
      }
    }

    return null;
  } catch (err) {
    logError("tcdb", "TCDB set search failed", err);
    return null;
  }
}
