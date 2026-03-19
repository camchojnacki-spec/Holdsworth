"use server";

/**
 * eBay Browse API scraper — searches ACTIVE listings via official API.
 * Returns current market asking prices (not sold data).
 * For sold data, use 130point scraper.
 */

export interface EbayApiListing {
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl: string | null;
  condition: string | null;
  buyingOptions: string[];
  bidCount: number | null;
  seller: string | null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) return null;

  try {
    const auth = Buffer.from(`${appId}:${certId}`).toString("base64");
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });

    if (!res.ok) return null;
    const data = await res.json();

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export async function scrapeEbayApi(query: string): Promise<{
  success: boolean;
  query: string;
  url: string;
  listings: EbayApiListing[];
  total: number;
  error?: string;
}> {
  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=213`;

  const token = await getEbayToken();
  if (!token) {
    return { success: false, query, url: searchUrl, listings: [], total: 0, error: "eBay API not configured" };
  }

  try {
    // Category 213 = Sports Trading Cards
    const params = new URLSearchParams({
      q: query,
      category_ids: "213",
      limit: "20",
      sort: "-price", // highest price first for better relevance
    });

    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.log(`[ebay-api] Error ${res.status}: ${err.substring(0, 200)}`);
      return { success: false, query, url: searchUrl, listings: [], total: 0, error: `eBay API ${res.status}` };
    }

    const data = await res.json();
    const listings: EbayApiListing[] = [];

    for (const item of data.itemSummaries || []) {
      listings.push({
        title: item.title || "",
        price: parseFloat(item.price?.value || "0"),
        currency: item.price?.currency || "USD",
        url: item.itemWebUrl || "",
        imageUrl: item.image?.imageUrl || null,
        condition: item.condition || null,
        buyingOptions: item.buyingOptions || [],
        bidCount: item.bidCount || null,
        seller: item.seller?.username || null,
      });
    }

    console.log(`[ebay-api] Found ${listings.length} active listings (total: ${data.total || 0})`);
    return {
      success: true,
      query,
      url: searchUrl,
      listings,
      total: data.total || 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "eBay API request failed";
    return { success: false, query, url: searchUrl, listings: [], total: 0, error: message };
  }
}
