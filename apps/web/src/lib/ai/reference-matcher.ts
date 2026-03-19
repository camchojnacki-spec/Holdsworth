"use server";

import { db, referenceCards, setProducts, subsets, manufacturers } from "@holdsworth/db";
import { eq, and, ilike } from "drizzle-orm";
import type { CardScanResponse } from "./gemini";

export interface ReferenceMatch {
  referenceCardId: string;
  productName: string;        // "Topps Series 1"
  subsetName: string | null;  // "1990 Topps Baseball Autographs"
  isAutograph: boolean;
  isRelic: boolean;
  isRookieCard: boolean;
  isShortPrint: boolean;
  correctedSetName: string;   // Full corrected set name for display
}

/**
 * Match an AI scan result against the reference card database.
 * Uses card number + year + manufacturer as the primary key.
 *
 * Returns the corrected data if a match is found, null otherwise.
 */
export async function matchAgainstReference(
  aiResult: CardScanResponse
): Promise<ReferenceMatch | null> {
  if (!aiResult.card_number || !aiResult.year) return null;

  // Normalize the card number — remove leading # if present
  const cardNumber = aiResult.card_number.replace(/^#/, "").trim();
  if (!cardNumber) return null;

  try {
    // Query: find reference cards matching this card number + year
    const matches = await db
      .select({
        refId: referenceCards.id,
        cardNumber: referenceCards.cardNumber,
        playerName: referenceCards.playerName,
        team: referenceCards.team,
        isRookieCard: referenceCards.isRookieCard,
        isAutograph: referenceCards.isAutograph,
        isRelic: referenceCards.isRelic,
        isShortPrint: referenceCards.isShortPrint,
        productName: setProducts.name,
        productYear: setProducts.year,
        manufacturerName: manufacturers.name,
        subsetName: subsets.name,
        subsetType: subsets.subsetType,
      })
      .from(referenceCards)
      .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
      .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
      .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
      .where(
        and(
          eq(referenceCards.cardNumber, cardNumber),
          eq(setProducts.year, aiResult.year)
        )
      );

    if (matches.length === 0) {
      // Try without year in case AI got year wrong but card number is unique enough
      const looseMatches = await db
        .select({
          refId: referenceCards.id,
          cardNumber: referenceCards.cardNumber,
          playerName: referenceCards.playerName,
          isRookieCard: referenceCards.isRookieCard,
          isAutograph: referenceCards.isAutograph,
          isRelic: referenceCards.isRelic,
          isShortPrint: referenceCards.isShortPrint,
          productName: setProducts.name,
          productYear: setProducts.year,
          manufacturerName: manufacturers.name,
          subsetName: subsets.name,
        })
        .from(referenceCards)
        .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
        .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
        .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
        .where(eq(referenceCards.cardNumber, cardNumber));

      if (looseMatches.length === 1) {
        const m = looseMatches[0];
        console.log(`[reference-matcher] Loose match: ${cardNumber} → ${m.productYear} ${m.productName} (${m.subsetName || "base"})`);
        return {
          referenceCardId: m.refId,
          productName: m.productName,
          subsetName: m.subsetName,
          isAutograph: m.isAutograph ?? false,
          isRelic: m.isRelic ?? false,
          isRookieCard: m.isRookieCard ?? false,
          isShortPrint: m.isShortPrint ?? false,
          correctedSetName: `${m.productName}`,
        };
      }

      console.log(`[reference-matcher] No match for ${cardNumber} (year ${aiResult.year})`);
      return null;
    }

    // If multiple matches for same card number + year, disambiguate by manufacturer
    let match = matches[0];
    if (matches.length > 1 && aiResult.manufacturer) {
      const mfgMatch = matches.find(m =>
        m.manufacturerName?.toLowerCase() === aiResult.manufacturer.toLowerCase()
      );
      if (mfgMatch) match = mfgMatch;
    }

    console.log(`[reference-matcher] Match: ${cardNumber} → ${match.productYear} ${match.productName} (${match.subsetName || "base"})`);

    return {
      referenceCardId: match.refId,
      productName: match.productName,
      subsetName: match.subsetName,
      isAutograph: match.isAutograph ?? false,
      isRelic: match.isRelic ?? false,
      isRookieCard: match.isRookieCard ?? false,
      isShortPrint: match.isShortPrint ?? false,
      correctedSetName: `${match.productName}`,
    };
  } catch (err) {
    console.error("[reference-matcher] Error:", err);
    return null;
  }
}

/**
 * Apply reference match corrections to an AI scan result.
 * Returns the corrected result with a flag indicating what changed.
 */
export async function applyReferenceCorrections(
  aiResult: CardScanResponse,
  match: ReferenceMatch
): CardScanResponse & { _aiCorrected: boolean; _referenceCardId: string; _subsetOrInsert: string | null } {
  return {
    ...aiResult,
    set_name: match.correctedSetName,
    subset_or_insert: match.subsetName,
    is_autograph: match.isAutograph || aiResult.is_autograph,
    is_relic: match.isRelic || aiResult.is_relic,
    is_rookie_card: match.isRookieCard || aiResult.is_rookie_card,
    is_short_print: match.isShortPrint || aiResult.is_short_print,
    _aiCorrected: true,
    _referenceCardId: match.referenceCardId,
    _subsetOrInsert: match.subsetName,
  };
}
