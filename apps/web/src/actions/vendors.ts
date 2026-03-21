"use server";

import { db, vendors, vendorProducts, setProducts, referenceCards, cards, currencyRates, userSettings } from "@holdsworth/db";
import { eq, and, sql, isNotNull } from "drizzle-orm";

// Provincial tax rates (HST/GST + PST)
const TAX_RATES: Record<string, number> = {
  AB: 0.05,  // GST only
  BC: 0.12,  // GST 5% + PST 7%
  MB: 0.12,  // GST 5% + PST 7%
  NB: 0.15,  // HST
  NL: 0.15,  // HST
  NS: 0.15,  // HST
  NT: 0.05,  // GST only
  NU: 0.05,  // GST only
  ON: 0.13,  // HST
  PE: 0.15,  // HST
  QC: 0.14975, // GST 5% + QST 9.975%
  SK: 0.11,  // GST 5% + PST 6%
  YT: 0.05,  // GST only
};

/**
 * Get available vendor products for a card's set product.
 * Returns vendors sorted by total landed cost (cheapest first).
 */
export async function getVendorAvailability(cardId: string) {
  // Get the card's set product
  const [card] = await db
    .select({
      referenceCardId: cards.referenceCardId,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card?.referenceCardId) return [];

  const [refCard] = await db
    .select({ setProductId: referenceCards.setProductId })
    .from(referenceCards)
    .where(eq(referenceCards.id, card.referenceCardId))
    .limit(1);

  if (!refCard) return [];

  // Get vendor products for this set
  const results = await db
    .select({
      vendorName: vendors.name,
      vendorCountry: vendors.country,
      shipsToCanada: vendors.shipsToCanada,
      productName: vendorProducts.productName,
      productUrl: vendorProducts.productUrl,
      productType: vendorProducts.productType,
      priceUsd: vendorProducts.priceUsd,
      priceCad: vendorProducts.priceCad,
      totalLandedCad: vendorProducts.totalLandedCad,
      inStock: vendorProducts.inStock,
      lastChecked: vendorProducts.lastChecked,
    })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(eq(vendorProducts.setProductId, refCard.setProductId))
    .orderBy(sql`COALESCE(${vendorProducts.totalLandedCad}, ${vendorProducts.priceCad}, ${vendorProducts.priceUsd}) ASC`);

  return results;
}

/**
 * Calculate total landed cost in CAD for a US vendor product.
 * Includes: USD→CAD conversion + shipping + tariff + provincial tax.
 */
export async function calculateLandedCost(input: {
  priceUsd: number;
  shippingUsd?: number;
  province?: string;
  tariffPercent?: number;
}): Promise<{
  priceCad: number;
  shippingCad: number;
  tariffCad: number;
  taxCad: number;
  totalLandedCad: number;
  exchangeRate: number;
}> {
  // Get current exchange rate
  const [rate] = await db
    .select()
    .from(currencyRates)
    .where(
      and(
        eq(currencyRates.fromCurrency, "USD"),
        eq(currencyRates.toCurrency, "CAD")
      )
    )
    .limit(1);

  const exchangeRate = rate?.rate ? parseFloat(rate.rate) : 1.36; // Fallback rate

  // Get province from user settings if not provided
  let province = input.province;
  if (!province) {
    const [settings] = await db.select().from(userSettings).limit(1);
    province = settings?.province ?? "ON";
  }

  const priceCad = input.priceUsd * exchangeRate;
  const shippingCad = (input.shippingUsd ?? 20) * exchangeRate; // Default $20 USD shipping
  const tariffPercent = input.tariffPercent ?? 0; // Default 0% (cards often duty-free under de minimis)
  const tariffCad = (priceCad + shippingCad) * (tariffPercent / 100);
  const taxRate = TAX_RATES[province] ?? 0.13;
  const taxCad = (priceCad + shippingCad + tariffCad) * taxRate;
  const totalLandedCad = priceCad + shippingCad + tariffCad + taxCad;

  return {
    priceCad: Math.round(priceCad * 100) / 100,
    shippingCad: Math.round(shippingCad * 100) / 100,
    tariffCad: Math.round(tariffCad * 100) / 100,
    taxCad: Math.round(taxCad * 100) / 100,
    totalLandedCad: Math.round(totalLandedCad * 100) / 100,
    exchangeRate,
  };
}

/**
 * Get all vendors with product counts.
 */
export async function getVendors() {
  const results = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      websiteUrl: vendors.websiteUrl,
      shipsToCanada: vendors.shipsToCanada,
      country: vendors.country,
      productCount: sql<number>`(
        SELECT COUNT(*) FROM vendor_products
        WHERE vendor_products.vendor_id = ${vendors.id}
      )::int`,
      inStockCount: sql<number>`(
        SELECT COUNT(*) FROM vendor_products
        WHERE vendor_products.vendor_id = ${vendors.id} AND vendor_products.in_stock = true
      )::int`,
    })
    .from(vendors)
    .orderBy(vendors.name);

  return results;
}
