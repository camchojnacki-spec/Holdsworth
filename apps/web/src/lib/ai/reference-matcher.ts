"use server";

import { db, referenceCards, setProducts, subsets, manufacturers, parallelTypes } from "@holdsworth/db";
import { eq, and, or, ilike, inArray } from "drizzle-orm";
import type { CardScanResponse } from "./gemini";
import type { CardTextExtraction } from "./text-extraction";

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

// ── Multi-Pass Reference Lookup (Stage 2) ──

export interface ReferenceLookupResult {
  type: "exact" | "multiple" | "none";
  matches: ReferenceMatch[];
  // For 'exact': 1 match, confidence 0.95+
  // For 'multiple': 2-5 matches to disambiguate visually
  // For 'none': no matches, fall through to full identification
  availableParallels?: Array<{
    name: string;
    printRun: number | null;
    colorFamily?: string | null;
  }>;
}

/**
 * Stage 2: Multi-pass reference lookup using text extraction results.
 * Searches by card number + year with progressive fallback strategies.
 * Also loads available parallels for matched set products.
 */
export async function multiPassReferenceLookup(
  textExtraction: CardTextExtraction
): Promise<ReferenceLookupResult> {
  const noResult: ReferenceLookupResult = { type: "none", matches: [] };

  if (!textExtraction.cardNumber) {
    console.log("[multi-pass-lookup] No card number extracted, skipping lookup");
    return noResult;
  }

  const cardNumber = textExtraction.cardNumber.replace(/^#/, "").trim();
  if (!cardNumber) return noResult;

  try {
    const selectFields = {
      refId: referenceCards.id,
      cardNumber: referenceCards.cardNumber,
      playerName: referenceCards.playerName,
      team: referenceCards.team,
      setProductId: referenceCards.setProductId,
      isRookieCard: referenceCards.isRookieCard,
      isAutograph: referenceCards.isAutograph,
      isRelic: referenceCards.isRelic,
      isShortPrint: referenceCards.isShortPrint,
      productName: setProducts.name,
      productYear: setProducts.year,
      manufacturerName: manufacturers.name,
      subsetName: subsets.name,
    };

    // Strategy 1: card number + exact year
    type MatchRow = {
      refId: string;
      cardNumber: string;
      playerName: string;
      team: string | null;
      setProductId: string;
      isRookieCard: boolean | null;
      isAutograph: boolean | null;
      isRelic: boolean | null;
      isShortPrint: boolean | null;
      productName: string;
      productYear: number;
      manufacturerName: string | null;
      subsetName: string | null;
    };
    let matches: MatchRow[] = [];
    if (textExtraction.copyrightYear) {
      matches = await db
        .select(selectFields)
        .from(referenceCards)
        .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
        .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
        .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
        .where(
          and(
            eq(referenceCards.cardNumber, cardNumber),
            eq(setProducts.year, textExtraction.copyrightYear)
          )
        );
      console.log(`[multi-pass-lookup] Strategy 1 (number+year): ${matches.length} matches for #${cardNumber} year ${textExtraction.copyrightYear}`);
    }

    // Strategy 2: card number + year ±1 (if no exact year match)
    if (matches.length === 0 && textExtraction.copyrightYear) {
      const yearMinus = textExtraction.copyrightYear - 1;
      const yearPlus = textExtraction.copyrightYear + 1;
      matches = await db
        .select(selectFields)
        .from(referenceCards)
        .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
        .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
        .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
        .where(
          and(
            eq(referenceCards.cardNumber, cardNumber),
            or(
              eq(setProducts.year, yearMinus),
              eq(setProducts.year, yearPlus)
            )
          )
        );
      console.log(`[multi-pass-lookup] Strategy 2 (number+year±1): ${matches.length} matches`);
    }

    // Strategy 3: card number only (no year)
    if (matches.length === 0) {
      matches = await db
        .select(selectFields)
        .from(referenceCards)
        .innerJoin(setProducts, eq(referenceCards.setProductId, setProducts.id))
        .leftJoin(manufacturers, eq(setProducts.manufacturerId, manufacturers.id))
        .leftJoin(subsets, eq(referenceCards.subsetId, subsets.id))
        .where(eq(referenceCards.cardNumber, cardNumber));
      console.log(`[multi-pass-lookup] Strategy 3 (number only): ${matches.length} matches`);
    }

    if (matches.length === 0) {
      console.log(`[multi-pass-lookup] No matches found for #${cardNumber}`);
      return noResult;
    }

    // Cap at 5 candidates — more than that is too ambiguous
    const cappedMatches = matches.slice(0, 5);

    // Convert to ReferenceMatch format
    const refMatches: ReferenceMatch[] = cappedMatches.map((m) => ({
      referenceCardId: m.refId,
      productName: m.productName,
      subsetName: m.subsetName ?? null,
      isAutograph: m.isAutograph ?? false,
      isRelic: m.isRelic ?? false,
      isRookieCard: m.isRookieCard ?? false,
      isShortPrint: m.isShortPrint ?? false,
      correctedSetName: m.productName,
    }));

    // Load available parallels for matched set product(s)
    const setProductIds = [...new Set(cappedMatches.map((m) => m.setProductId))];
    let availableParallels: ReferenceLookupResult["availableParallels"] = [];
    if (setProductIds.length > 0) {
      try {
        const parallels = await db
          .select({
            name: parallelTypes.name,
            printRun: parallelTypes.printRun,
            colorFamily: parallelTypes.colorFamily,
          })
          .from(parallelTypes)
          .where(
            setProductIds.length === 1
              ? eq(parallelTypes.setProductId, setProductIds[0])
              : inArray(parallelTypes.setProductId, setProductIds)
          );
        availableParallels = parallels.map((p) => ({
          name: p.name,
          printRun: p.printRun,
          colorFamily: p.colorFamily,
        }));
        console.log(`[multi-pass-lookup] Loaded ${availableParallels.length} parallel types for ${setProductIds.length} set(s)`);
      } catch (err) {
        console.warn("[multi-pass-lookup] Failed to load parallels:", err);
      }
    }

    // Determine result type
    if (refMatches.length === 1) {
      console.log(`[multi-pass-lookup] Exact match: ${refMatches[0].productName} #${cardNumber}`);
      return { type: "exact", matches: refMatches, availableParallels };
    }

    // If manufacturer text can disambiguate, try it
    if (textExtraction.manufacturerText && refMatches.length > 1) {
      const mfgLower = textExtraction.manufacturerText.toLowerCase();
      const mfgFiltered = cappedMatches.filter(
        (m) => m.manufacturerName?.toLowerCase().includes(mfgLower)
      );
      if (mfgFiltered.length === 1) {
        const m = mfgFiltered[0];
        const singleMatch: ReferenceMatch = {
          referenceCardId: m.refId,
          productName: m.productName,
          subsetName: m.subsetName ?? null,
          isAutograph: m.isAutograph ?? false,
          isRelic: m.isRelic ?? false,
          isRookieCard: m.isRookieCard ?? false,
          isShortPrint: m.isShortPrint ?? false,
          correctedSetName: m.productName,
        };
        console.log(`[multi-pass-lookup] Manufacturer-disambiguated to exact: ${singleMatch.productName}`);
        return { type: "exact", matches: [singleMatch], availableParallels };
      }
    }

    console.log(`[multi-pass-lookup] Multiple matches (${refMatches.length}) — needs visual disambiguation`);
    return { type: "multiple", matches: refMatches, availableParallels };
  } catch (err) {
    console.error("[multi-pass-lookup] Error:", err);
    return noResult;
  }
}

/**
 * Apply reference match corrections to an AI scan result.
 * Returns the corrected result with a flag indicating what changed.
 */
export async function applyReferenceCorrections(
  aiResult: CardScanResponse,
  match: ReferenceMatch
): Promise<CardScanResponse & { _aiCorrected: boolean; _referenceCardId: string; _subsetOrInsert: string | null }> {
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
