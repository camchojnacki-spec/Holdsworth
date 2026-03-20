import { db, currencyRates } from "@holdsworth/db";
import { eq, and, desc } from "drizzle-orm";
import { log, logError } from "../lib/logger";

const EXCHANGE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

/**
 * Fetch the latest USD/CAD rate and store in currencyRates.
 * Called by the worker on startup and then daily.
 */
export async function updateCurrencyRates(): Promise<void> {
  try {
    const res = await fetch(EXCHANGE_API_URL);
    if (!res.ok) {
      logError("currency", "Exchange rate API returned " + res.status, null);
      return;
    }

    const data = await res.json() as { rates?: Record<string, number> };
    const cadRate = data.rates?.CAD;
    if (!cadRate || typeof cadRate !== "number") {
      logError("currency", "No CAD rate in response", null);
      return;
    }

    await db.insert(currencyRates).values({
      fromCurrency: "USD",
      toCurrency: "CAD",
      rate: String(cadRate),
    });

    log("currency", `Updated USD/CAD rate: ${cadRate}`);
  } catch (err) {
    logError("currency", "Failed to update currency rates", err);
  }
}

/**
 * Get the latest USD to CAD exchange rate.
 * Falls back to 1.38 if no rate exists in DB.
 */
export async function getUsdToCad(): Promise<number> {
  try {
    const [latest] = await db
      .select({ rate: currencyRates.rate })
      .from(currencyRates)
      .where(
        and(
          eq(currencyRates.fromCurrency, "USD"),
          eq(currencyRates.toCurrency, "CAD")
        )
      )
      .orderBy(desc(currencyRates.recordedAt))
      .limit(1);

    if (latest?.rate) {
      return parseFloat(latest.rate);
    }
  } catch {
    // Fall through to default
  }
  return 1.38;
}
